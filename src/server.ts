import express from 'express';
import bodyParser from 'body-parser';

export const createServer = () => {
    const app = express();
    app.use(bodyParser.json());

    app.get('/', (req, res) => {
        res.send('Hello, world!');
    });

    return app;
};
