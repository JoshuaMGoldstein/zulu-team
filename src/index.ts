import { createGui } from './gui';
import apiServer from './apiserver';
import { log } from './utils/log';
import { updateModelsFile } from './models';
import * as dotenv from 'dotenv';

dotenv.config();

const main = async () => {
    const guiServer = createGui();

    await updateModelsFile();
    apiServer.initBots();

    guiServer.listen(3000, () => {
        log('Management GUI listening on port 3000');
    });

    apiServer.listen(3001, () => {
        log('API Server listening on port 3001');
    });
};

main().catch(err => {
    log('Error starting server:', err);
    process.exit(1);
});
