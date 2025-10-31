// Lädt Umgebungsvariablen aus der .env-Datei (nur für lokale Tests)
require('dotenv').config();

const express = require('express');
const { MongoClient } = require('mongodb');
const multer = require('multer');
const cors = require('cors');

// --- Konfiguration ---
const app = express();
// Lima-city oder andere Hoster verwenden oft die Umgebungsvariable PORT
const port = process.env.PORT || 3000; 

// MongoDB Connection String aus der Umgebungsvariable (Muss auf dem Server gesetzt werden!)
const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error("Error: MONGODB_URI ist nicht in den Umgebungsvariablen gesetzt."); 
    process.exit(1); 
}

const client = new MongoClient(uri);

// Multer Konfiguration: Datei im Speicher halten (wichtig, da wir keinen lokalen Speicher benötigen)
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { 
        fileSize: 10 * 1024 * 1024 // Begrenze Dateigröße auf 10MB
    }
});

// --- Middleware ---
// CORS ist wichtig, falls das Frontend und der Server auf unterschiedlichen Domains/Ports laufen 
app.use(cors()); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- API Endpoint: GET / (Status-Check) ---
// DIESE ROUTE BEHEBT DAS "Cannot GET /"
app.get('/', (req, res) => {
    res.status(200).json({ 
        status: "API Server läuft erfolgreich!", 
        message: "Dies ist der API-Server für den Foto-Upload. Verwenden Sie den Endpunkt /upload für POST-Anfragen.",
        expected_endpoint: "/upload (POST)"
    });
});


// --- Hauptfunktion zur Verbindung mit MongoDB und Start des Servers ---
async function run() {
    try {
        // Verbindung zum MongoDB Cluster herstellen
        await client.connect();
        console.log("Successfully connected to MongoDB."); // Erfolgreich mit MongoDB verbunden.

        const database = client.db('fotoAppDB'); // Datenbank auswählen
        const collection = database.collection('submissions'); // Collection auswählen
        
        // --- API Endpoint: POST /upload ---
        app.post('/upload', upload.single('photo'), async (req, res) => {
            try {
                // 1. Textdaten aus req.body abrufen
                const { firstName, lastName, dob, age } = req.body;

                // Zusätzliche Server-seitige Validierung
                if (!firstName || !lastName || !dob || !age || isNaN(parseInt(age, 10))) {
                    return res.status(400).json({ message: "Fehlende oder ungültige Textdaten (firstName, lastName, dob, age)." });
                }

                // 2. Dokument für die Speicherung erstellen
                const submissionData = {
                    firstName,
                    lastName,
                    dob,
                    age: parseInt(age, 10), // Alter als Zahl speichern
                    submittedAt: new Date(),
                    photoBase64: null, 
                    photoMimeType: null
                };

                // 3. Fotodaten verarbeiten (falls vorhanden)
                const ageInt = parseInt(age, 10);
                
                if (req.file) {
                    // Datei in Base64 umwandeln und in das Dokument einfügen
                    submissionData.photoBase64 = req.file.buffer.toString('base64');
                    submissionData.photoMimeType = req.file.mimetype;
                } else if (ageInt >= 15) {
                    // Foto ist erforderlich, wenn Alter >= 15
                    return res.status(400).json({ message: "Foto ist für dieses Alter (>= 15) erforderlich." }); 
                }

                // 4. Dokument in MongoDB einfügen
                const result = await collection.insertOne(submissionData);
                console.log(`New entry created with ID: ${result.insertedId}`);

                // 5. Erfolgsmeldung an das Frontend senden
                res.status(201).json({ message: "Upload erfolgreich!", insertedId: result.insertedId });

            } catch (error) {
                console.error("Error processing upload:", error);
                // Wichtiger Hinweis: Bei zu großen Dateien fängt Multer den Fehler
                if (error.code === 'LIMIT_FILE_SIZE') {
                    return res.status(413).json({ message: "Die hochgeladene Datei ist zu groß (maximal 10MB erlaubt)." });
                }
                res.status(500).json({ message: "Interner Serverfehler während des Uploads." });
            }
        });

        // --- Server starten ---
        app.listen(port, () => {
            console.log(`Server is running on port ${port}`); 
        });

    } catch (err) {
        console.error("Could not connect to MongoDB:", err); 
        process.exit(1); 
    }
}

// Starte die Serverlogik
run();
