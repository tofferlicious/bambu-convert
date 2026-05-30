document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const convertBtn = document.getElementById('convert-btn');
    const statusDiv = document.getElementById('status');
    const statusMessage = document.getElementById('status-message');

    let currentFile = null;

    // Handle Drag & Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');

        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // Handle File Input Click
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    function handleFile(file) {
        if (!file.name.toLowerCase().endsWith('.3mf')) {
            showStatus('Please upload a valid .3mf file.', 'error');
            convertBtn.disabled = true;
            currentFile = null;
            return;
        }

        currentFile = file;
        showStatus(`File loaded: ${file.name}. Ready to convert.`, 'info');
        convertBtn.disabled = false;
    }

    function showStatus(message, type) {
        statusDiv.className = `status ${type}`;
        statusMessage.textContent = message;
        statusDiv.classList.remove('hidden');
    }

    // Convert Button Click
    convertBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        convertBtn.disabled = true;
        showStatus('Processing...', 'info');

        try {
            await process3MF(currentFile);
            showStatus('Conversion successful! Download started.', 'success');
        } catch (error) {
            console.error(error);
            showStatus(`Error: ${error.message}`, 'error');
        } finally {
            convertBtn.disabled = false;
        }
    });



    async function process3MF(file) {
        if (!window.JSZip) {
            throw new Error("JSZip library failed to load.");
        }

        const zip = new JSZip();

        // 1. Read the uploaded .3mf file
        const loadedZip = await zip.loadAsync(file);

        // 2. Iterate through all files in the zip
        for (const relativePath in loadedZip.files) {
            const zipEntry = loadedZip.files[relativePath];

            // Skip directories
            if (zipEntry.dir) continue;

            // Only process XML or config files where Bambu Studio specific tags usually live
            if (relativePath.endsWith('.xml') || relativePath.endsWith('.model') || relativePath.endsWith('.config')) {

                let content = await zipEntry.async("string");
                let originalContent = content;

                // Sanitize the content:
                // Makerworld/Bambu uses specific text generators that break Anycubic slicer
                // We will try to strip bambu specific attributes and namespaces that cause issues.

                // Use DOMParser for safer XML manipulation if possible, but fallback to robust regex
                // First, remove text objects which might be self-closing or have content
                content = content.replace(/<bambu_studio:text_object[^>]*\/?>/g, ''); // Self-closing or opening
                content = content.replace(/<\/bambu_studio:text_object>/g, ''); // Closing tags

                // Remove bambu_studio namespaced attributes (e.g. bambu_studio:foo="bar")
                content = content.replace(/bambu_studio:[a-zA-Z0-9_-]+="[^"]*"/g, '');

                // Remove the namespace declaration itself LAST, to ensure we don't invalidate remaining tags
                // if there were any missed by the above regexes.
                content = content.replace(/xmlns:bambu_studio="[^"]*"/g, '');

                // Also look for slicer metadata that might confuse Anycubic Slicer
                // Sometimes Bambu studio sets generator="BambuStudio 1.X.X" in 3dmodel.model
                content = content.replace(/generator="BambuStudio [^"]*"/g, 'generator="PrusaSlicer 2.7.0"');
                content = content.replace(/generator="OrcaSlicer [^"]*"/g, 'generator="PrusaSlicer 2.7.0"');

                // Clean up any empty lines created by regex replacements
                content = content.replace(/^\s*$[\r\n]*/gm, '');

                // If content was modified, update the zip entry
                if (content !== originalContent) {
                    console.log(`Modified ${relativePath} to remove Bambu/Orca specific tags.`);
                    loadedZip.file(relativePath, content);
                }
            }
        }

        // 3. Repackage the zip
        const newZipBlob = await loadedZip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: {
                level: 6
            }
        });

        // 4. Trigger download
        const newFilename = file.name.replace('.3mf', '_anycubic_fixed.3mf');
        saveAs(newZipBlob, newFilename);
    }
});
