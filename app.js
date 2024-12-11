require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const passport = require('passport');
const ExpressSession = require('express-session');
const mongoose = require('mongoose');
const passportJWT = require('passport-jwt');
const userModel = require('./models/user');
const db = require('./db/db')
const MongoStore = require('connect-mongo');
const cors = require('cors')


// Configure express-session to use connect-mongo
const mongoStore = MongoStore.create({
    mongoUrl: process.env.MONGO_URL,
    ttl: 14 * 24 * 60 * 60 // Session TTL (optional)
});

const app = express()

app.use(cors({
    credentials: true,
}))

app.use(
    ExpressSession({
        store: mongoStore,
        resave: false,
        saveUninitialized: false,
        secret: process.env.SESSION_SECRET,
    })
);
app.use(passport.initialize());
app.use(passport.session());

const JWTStrategy = passportJWT.Strategy;
const ExtractJWT = passportJWT.ExtractJwt;

passport.use(new JWTStrategy({
    jwtFromRequest: ExtractJWT.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET
},
    function (jwtPayload, cb) {
        return userModel.findById(jwtPayload._id)
            .then(user => {
                return cb(null, user);
            })
            .catch(err => {
                return cb(err);
            });
    }
));


passport.serializeUser(userModel.serializeUser());
passport.deserializeUser(userModel.deserializeUser());

var indexRouter = require('./routes/index');
var authRouter = require('./routes/auth');


app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/auth', authRouter);

app.use('*', (req, res, next) => {
    res.send('beat-stream')
})



process.on('uncaughtException', (err) => {
    console.log('Uncaught exception:', err);
    /* send email to admins */
});

process.on('unhandledRejection', (err) => {
    console.log('Unhandled rejection:', err);
    /* send email to admins */
});





module.exports = app;
