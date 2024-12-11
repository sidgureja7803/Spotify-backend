const firebaseAdmin = require('../firebase-config')
const { Readable } = require('stream')
const id3 = require('node-id3')
const trackModel = require('../models/track')
const artistModel = require('../models/artist')
const crypto = require('crypto')
const likeModel = require('../models/like')
const userModel = require('../models/user')
const historyModel = require('../models/history')


module.exports.index = function (req, res, next) {
    console.log(req.cookies)
    res.status(200).json({ message: "spotify" })
}


module.exports.upload = async (req, res) => {
    try {
        const files = req.files; // Assuming req.files contains an array of uploaded files
        const uploads = [];

        for (const file of files) {
            const fileState = id3.read(file.buffer);

            const artist = fileState.artist ? fileState.artist.split('/') : [];

            const artists = await Promise.all(artist.map(async (artistName) => {
                let artist = await artistModel.findOne({ name: artistName.toLowerCase() });

                if (!artist) {
                    artist = await artistModel.create({ name: artistName.toLowerCase() });
                }
                return artist._id;
            }));

            uploads.push({
                title: fileState.title,
                artists,
                album: fileState.album,
                year: fileState.year,
                file,
                fileState
            });
        }

        const bucket = firebaseAdmin.storage().bucket();
        const uploadPromises = [];

        for (const upload of uploads) {
            const existingTrack = await trackModel.findOne({ title: upload.title });
            if (!existingTrack) {
                const fileRefAudio = bucket.file(upload.file.originalname);
                const bufferStream = Readable.from(upload.file.buffer);
                const writeStreamAudio = fileRefAudio.createWriteStream();
                const audioUploadPromise = new Promise((resolve, reject) => {
                    bufferStream.pipe(writeStreamAudio);
                    writeStreamAudio.on('finish', async () => {
                        await fileRefAudio.makePublic();
                        const AudioUrls = fileRefAudio.publicUrl();
                        resolve(AudioUrls);
                    });
                    writeStreamAudio.on('error', reject);
                });
                const fileRafPoster = bucket.file(crypto.randomBytes(43).toString("hex") + "." + upload.fileState.image.mime.split('/')[ 1 ]);
                const posterFileStream = Readable.from(upload.fileState.image.imageBuffer);
                const posterWritStream = fileRafPoster.createWriteStream();

                const posterUploadPromise = new Promise((resolve, reject) => {
                    posterFileStream.pipe(posterWritStream);
                    posterWritStream.on('finish', async () => {
                        await fileRafPoster.makePublic();
                        const PosterUrls = fileRafPoster.publicUrl();
                        resolve(PosterUrls);
                    });
                    posterWritStream.on('error', reject);
                });

                uploadPromises.push(Promise.all([ audioUploadPromise, posterUploadPromise, upload ]));
            } else {
                console.log(`Track with title "${upload.title}" already exists. Skipping upload.`);
            }
        }

        const results = await Promise.all(uploadPromises);

        const tracks = [];

        for (const [ audioUrl, posterUrl, upload ] of results) {
            // Check if a track with the same title already exists
            const existingTrack = await trackModel.findOne({ title: upload.title });

            if (!existingTrack) {
                const newTrack = await trackModel.create({
                    title: upload.title,
                    artists: upload.artists,
                    album: upload.album,
                    year: upload.year,
                    poster: posterUrl,
                    url: audioUrl,
                });
                tracks.push(newTrack);
            } else {
                console.log(`Track with title "${upload.title}" already exists. Skipping upload.`);
            }
        }

        res.json({ message: 'Files uploaded successfully!', tracks });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error uploading files!' });
    }
};


module.exports.createHistory = async (req, res) => {
    try {
        const trackId = req.body.trackId;
        const userId = req.user._id;


        if (!trackId) {
            return res.status(400).json({ message: 'Track ID is required!' });
        }


        let history = await historyModel.findOne({
            userId,
            trackId,
        });

        if (history) {
            // If the history document exists, update the 'looped' field
            history.repeat = history.repeat + 1;
            await history.save();
        } else {
            // If the history document doesn't exist, create a new one
            history = await historyModel.create({
                userId,
                trackId,
                repeat: 1,
            });
        }
        res.json({ message: 'History updated successfully!', history });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating history!' });
    }
};


module.exports.getRandomTracks = async (req, res) => {
    try {
        let tracks = await trackModel.aggregate([
            { $sample: { size: 20 } },
            {
                $lookup: {
                    from: "artists",
                    localField: "artists",
                    foreignField: "_id",
                    as: "artistDetails"
                }
            },
            {
                $lookup: {
                    from: "likes",
                    let: { trackId: "$_id" },
                    pipeline: [
                        { $match: { $expr: { $and: [ { $eq: [ "$track", "$$trackId" ] }, { $eq: [ "$user", req.user._id ] } ] } } }
                    ],
                    as: "likes"
                }
            },
            {
                $addFields: {
                    artists: "$artistDetails",
                    isLiked: { $anyElementTrue: "$likes" }
                }
            },
            { $unset: [ "artistDetails", "likes" ] }
        ]);


        res.json({ message: 'Random tracks retrieved successfully!', tracks });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving random tracks!' });
    }
};

module.exports.likeTrack = async (req, res) => {
    try {
        const trackId = req.body.trackId;
        const userId = req.user._id;
        if (!trackId) {
            return res.status(400).json({ message: 'Track ID is required!' });
        }
        const track = await trackModel.findById(trackId);
        if (!track) {
            return res.status(404).json({ message: 'Track not found!' });
        }
        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found!' });
        }
        if (user.likedTracks.includes(trackId)) {
            await likeModel.deleteOne({ user: userId, track: trackId });
            return res.status(200).json({ message: 'Track already liked!', isLiked: false });
        }
        const newLike = await likeModel.create({
            user: userId,
            track: trackId,
        });
        res.status(200).json({ message: 'Track liked successfully!', isLiked: true });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error liking track!' });
    }
};

module.exports.checkLike = async (req, res) => {
    try {
        const trackId = req.body.trackId;
        const userId = req.user._id;
        if (!trackId) {
            return res.status(400).json({ message: 'Track ID is required!' });
        }
        const track = await trackModel.findById(trackId);
        if (!track) {
            return res.status(404).json({ message: 'Track not found!' });
        }
        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found!' });
        }
        const like = await likeModel.findOne({ user: userId, track: trackId });
        res.status(200).json({ message: 'Like checked successfully!', isLiked: !!like });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error checking like!' });
    }
}

module.exports.getLastTrack = async (req, res) => {
    try {
        const userId = req.user._id;
        const history = await historyModel.findOne({ userId })
            .populate('trackId')
            .populate({
                path: 'trackId',
                populate: {
                    path: 'artists',
                    model: 'artist'
                }
            })
            .sort({ updatedAt: -1 })

        if (!history) {
            return res.status(404).json({ message: 'No history found!' });
        }

        console.log(history)

        res.status(200).json({ message: 'Last track retrieved successfully!', track: history });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving last track!' });
    }
};

module.exports.getLastTracks = async (req, res) => {
    try {
        let userId = req.user._id; // Assuming the user's ID is available in req.user._id

        let history = await trackModel.aggregate([
            {
                $lookup: {
                    from: "histories",
                    localField: "_id",
                    foreignField: "trackId",
                    as: "history"
                }
            },
            { $match: { "history.userId": userId } },
            { $sort: { "history.updatedAt": -1 } },
            { $limit: 6 },
            {
                $lookup: {
                    from: "artists",
                    localField: "artists",
                    foreignField: "_id",
                    as: "artistDetails"
                }
            },
            {
                $lookup: {
                    from: "likes",
                    let: { trackId: "$_id" },
                    pipeline: [
                        { $match: { $expr: { $and: [ { $eq: [ "$track", "$$trackId" ] }, { $eq: [ "$user", userId ] } ] } } }
                    ],
                    as: "likes"
                }
            },
            {
                $addFields: {
                    artists: "$artistDetails",
                    isLiked: { $anyElementTrue: "$likes" }
                }
            },
            { $unset: [ "artistDetails", "likes" ] }
        ]);



        if (!history) {
            return res.status(404).json({ message: 'No history found!' });
        }

        res.status(200).json({ message: 'Last six tracks retrieved successfully!', tracks: history });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving last six tracks!' });
    }
}


module.exports.getArtists = async (req, res) => {
    try {
        let artists = await artistModel.aggregate([
            { $sample: { size: 6 } }
        ]);

        res.json({ message: 'Random artists retrieved successfully!', artists });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving random artists!' });
    }
}

module.exports.getArtistTracks = async (req, res) => {
    try {
        let artistId = req.body.artistId;
        let tracks = await trackModel.find({ artists: artistId });

        res.json({ message: 'Artist tracks retrieved successfully!', tracks });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving artist tracks!' });
    }
}


module.exports.search = async (req, res) => {
    try {
        let search = req.body.search;
        if (!search)
            return res.status(400).json({ message: 'Search query is required!' });

        let minTracks = 7; // Set your minimum number of tracks here

        let tracks = await trackModel.find(
            { $text: { $search: search } },
            { score: { $meta: "textScore" } }
        ).sort(
            { score: { $meta: "textScore" } }
        ).populate('artists');

        if (tracks.length < minTracks) {
            let trackIds = tracks.map(track => track._id); // Get the IDs of the initially found tracks
            let additionalTracks = await trackModel.find({
                title: { $regex: search, $options: 'i' },
                _id: { $nin: trackIds } // Exclude the initially found tracks
            }).limit(minTracks - tracks.length).populate('artists');
            tracks = tracks.concat(additionalTracks);
        }

        res.json({ message: 'Search results retrieved successfully!', tracks });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error retrieving search results!' });
    }
}