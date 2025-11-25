1. Allowed File Formats (Commonly Used & Safe)

These are the most widely used, safe, and practical formats we should allow in a government or enterprise DMS:

📄 Document Files
    •    .pdf
    •    .doc, .docx (Word)
    •    .xls, .xlsx (Excel)
    •    .ppt, .pptx (PowerPoint)
    •    .txt, .rtf
    •    .csv
    •    .odt, .ods, .odp (OpenOffice)

📷 Image Files
    •    .jpg, .jpeg
    •    .png
    •    .gif (optional — usually avoid unless needed)
    •    .bmp (rarely needed, high size)
    •    .tiff (for scanned documents)
    •    .webp (lightweight)

📚 Archive Files (if required)
    •    .zip, .rar (only if needed — suggest virus scan before allowing download)
    •    .7z, .tar.gz (optional)

🎞️ Video (only if explicitly needed)
    •    .mp4, .mov, .avi
    •    (But for most DMS, restrict unless required)

📐Others (Design/Engineering — optional)
    •    .dwg, .dxf (AutoCAD)
    •    .svg
    •    .json, .xml (config or metadata only if needed)

⸻

🚫 2. Blocked / Excluded File Formats

Even if you’re allowing only specific formats (whitelisting), it’s still good to explicitly reject or block malicious formats — in case of MIME type spoofing or renaming tricks.

❌ Dangerous File Types (never allow):
    •    .exe (executables)
    •    .msi (Windows installers)
    •    .bat, .cmd, .sh, .bash (shell scripts)
    •    .js, .ts, .jsx (JavaScript – often abused)
    •    .jar, .class (Java)
    •    .py, .rb, .php, .pl, .cgi (code/script files)
    •    .dll, .sys, .com, .vbs, .wsf, .scr
    •    .ps1 (PowerShell)
    •    .apk (Android installers)
    •    .iso, .img (disk images)
    •    .torrent (P2P content)
    •    .lnk (Windows shortcuts)

