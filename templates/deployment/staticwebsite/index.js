const express = require('express');
const path = require('path'); // Required for path.join
const app = express();
const port = 8088;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Optional: Define a route for the root URL to explicitly send index.html
// This is often not strictly necessary if index.html is in the served static directory,
// as express.static will automatically serve it for the root path.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Static server running at http://localhost:${port}`);
});