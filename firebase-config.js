const admin = require('firebase-admin');
const { privateKey } = JSON.parse(process.env.PRIVATE_KEY_FIREBASE);

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.PROJECT_ID,
        clientEmail: `firebase-adminsdk-dlojn@${process.env.PROJECT_ID}.iam.gserviceaccount.com`,
        privateKey
    }),
    storageBucket: 'gs://beat-stream.appspot.com' // Replace with your bucket name
});

module.exports = admin;
