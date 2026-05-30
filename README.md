# 3MF Converter for Anycubic Slicer

A client-side web application to convert `.3mf` files downloaded from Makerworld or created in Bambu Studio / Orca Slicer so that they are compatible with Anycubic Next Slicer.

## The Problem
Bambu Studio embeds specific namespaces (like `bambu_studio:`) and generator metadata into the 3D model XML files within the `.3mf` archive. When Anycubic Next Slicer attempts to open these files, it often fails to parse text objects properly, disables certain settings, or throws errors.

## The Solution
This tool processes the `.3mf` file entirely in your browser using JavaScript. It extracts the internal XML and configuration files, removes Bambu-specific tags and namespaces, changes the generator metadata to appear as standard PrusaSlicer, and repackages the file.

## Features
* **100% Client-Side:** No files are uploaded to any server. Everything happens securely in your web browser.
* **Easy to Use:** Drag and drop interface.
* **GitHub Pages Ready:** Because it's static HTML/JS/CSS, you can host this directly on GitHub Pages for free.

## How to Host
1. Push this repository to GitHub.
2. Go to your repository settings.
3. Under "Pages", select the `main` branch as your source.
4. Your tool will be live and accessible to everyone!
