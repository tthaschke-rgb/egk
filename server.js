// Loads environment variables from the .env file
require('dotenv').config();

const express = require('express');
const { MongoClient } = require('mongodb');
const multer = require('multer');
const cors = require('cors');

// --- Configuration ---
const app = express();
const port = process.env.PORT || 3000;

// MongoDB Connection String from the .env file
const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error("Error: MONGODB_URI is not set in the .env file."); // Fehler: MONGODB_URI ist nicht in der .env-Datei gesetzt.
    process.exit(1);
}

const client = new MongoClient(uri);

// Multer configuration for file uploads
// We use memoryStorage to keep the file in RAM and save it
// as Base64 in the DB instead of writing it to disk.
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Middleware ---
app.use(cors()); // Allows Cross-Origin requests (important for testing)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Main function to connect to MongoDB ---
async function run() {
    try {
        // Connect to the MongoDB cluster
        await client.connect();
        console.log("Successfully connected to MongoDB."); // Erfolgreich mit MongoDB verbunden.

        const database = client.db('fotoAppDB'); // Select database
        const collection = database.collection('submissions'); // Select collection

        // --- API Endpoint ---
        // POST /upload
        // 'photo' is the name of the <input type="file"> field in the FormData
        app.post('/upload', upload.single('photo'), async (req, res) => {
            try {
                // 1. Retrieve text data from req.body
                const { firstName, lastName, dob, age } = req.body;

                if (!firstName || !lastName || !dob || !age) {
                    return res.status(400).json({ message: "Missing text data." }); // Fehlende Textdaten.
                }

                // 2. Create the document to be stored
                const submissionData = {
                    firstName,
                    lastName,
                    dob,
                    age: parseInt(age, 10), // Store age as a number
                    submittedAt: new Date(),
                    photoBase64: null, // Default to null
                    photoMimeType: null
                };

                // 3. Process photo data from req.file (if available)
                if (req.file) {
                    // Convert file to Base64 and insert into the document
                    submissionData.photoBase64 = req.file.buffer.toString('base64');
                    submissionData.photoMimeType = req.file.mimetype;
                } else if (parseInt(age, 10) >= 15) {
                    // Photo is required if age >= 15
                    return res.status(400).json({ message: "Photo is required for this age." }); // Foto ist für dieses Alter erforderlich.
                }

                // 4. Insert document into MongoDB
                const result = await collection.insertOne(submissionData);
                console.log(`New entry created with ID: ${result.insertedId}`); // Neuer Eintrag erstellt mit ID:

                // 5. Send success message to the frontend
                res.status(201).json({ message: "Upload successful!", insertedId: result.insertedId }); // Upload erfolgreich!

            } catch (error) {
                console.error("Error processing upload:", error); // Fehler beim Verarbeiten des Uploads:
                res.status(500).json({ message: "Internal server error during upload." }); // Interner Serverfehler beim Upload.
            }
        });

        // --- Start server ---
        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`); // Server läuft auf http://localhost:${port}
        });

    } catch (err) {
        console.error("Could not connect to MongoDB:", err); // Konnte nicht mit MongoDB verbinden:
        process.exit(1);
    }
}

// Start server logic
run();

