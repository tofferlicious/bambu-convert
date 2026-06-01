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

    const logContainer = document.getElementById('log-container');
    const logList = document.getElementById('log-list');

    function logToUI(message) {
        if (logContainer.classList.contains('hidden')) {
            logContainer.classList.remove('hidden');
        }
        const li = document.createElement('li');
        li.textContent = message;
        logList.appendChild(li);
        // auto scroll to bottom
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    function clearLogs() {
        logList.innerHTML = '';
        logContainer.classList.add('hidden');
    }

    // Convert Button Click
    convertBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        clearLogs();
        convertBtn.disabled = true;
        showStatus('Processing...', 'info');
        logToUI(`Starting process for ${currentFile.name}...`);

        try {
            await process3MF(currentFile);
            showStatus('Conversion successful! Download started.', 'success');
            logToUI('Repackaging complete. Download triggered.');
        } catch (error) {
            console.error(error);
            showStatus(`Error: ${error.message}`, 'error');
            logToUI(`Error: ${error.message}`);
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

                // Replace incompatible values using robust string replacement to catch them inside
                // both JSON configs and XML files without depending on exact nesting structures.

                // enable_overhang_speed: Slicer expects "0" or false.
                // Replaces arrays like ["1", "1"] or comma-separated strings "1,1" with "0"
                content = content.replace(/"enable_overhang_speed":\s*\[[^\]]+\]/g, '"enable_overhang_speed": "0"');
                content = content.replace(/"enable_overhang_speed":\s*"[^"]+"/g, '"enable_overhang_speed": "0"');

                // ensure_vertical_shell_thickness: Slicer expects "ensure_all"
                content = content.replace(/"ensure_vertical_shell_thickness":\s*"enabled"/g, '"ensure_vertical_shell_thickness": "ensure_all"');

                // nozzle_type: Slicer has issues with "hardened_steel" mapping. Replace with "undefine"
                content = content.replace(/"nozzle_type":\s*\[[^\]]+\]/g, '"nozzle_type": "undefine"');
                content = content.replace(/"nozzle_type":\s*"[^"]+"/g, '"nozzle_type": "undefine"');

                // raft_first_layer_expansion: clamp negative values to "0"
                content = content.replace(/"raft_first_layer_expansion":\s*"-?[1-9]\d*"/g, '"raft_first_layer_expansion": "0"');

                // tree_support_wall_count: clamp negative values to "0"
                content = content.replace(/"tree_support_wall_count":\s*"-?[1-9]\d*"/g, '"tree_support_wall_count": "0"');

                // Clean up any empty lines created by regex replacements
                content = content.replace(/^\s*$[\r\n]*/gm, '');

                // If content was modified, update the zip entry
                if (content !== originalContent) {
                    console.log(`Modified ${relativePath} to remove Bambu/Orca specific tags.`);
                    logToUI(`Patched configurations in: ${relativePath}`);
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
