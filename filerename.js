const fs = require('fs');
const path = require('path');

// Define the directory where your music files are located
const directory = '/Users/ankurprajapati/Downloads/musics';

// Read the files in the directory
fs.readdir(directory, (err, files) => {
    if (err) {
        console.error('Error reading directory:', err);
        return;
    }

    // Iterate through each file
    files.forEach(file => {
        // Check if the file name contains '[SPOTIFY-DOWNLOADER.COM]'
        if (file.includes('[SPOTIFY-DOWNLOADER.COM]')) {
            // Construct the new file name by removing '[SPOTIFY-DOWNLOADER.COM]'
            const newFileName = file.replace('[SPOTIFY-DOWNLOADER.COM]', '');

            // Construct the paths to the original and new file
            const oldPath = path.join(directory, file);
            const newPath = path.join(directory, newFileName);

            // Rename the file
            fs.rename(oldPath, newPath, err => {
                if (err) {
                    console.error('Error renaming file:', err);
                } else {
                    console.log(`File ${file} renamed to ${newFileName}`);
                }
            });
        }
    });
});

// this code 