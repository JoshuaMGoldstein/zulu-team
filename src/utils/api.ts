import * as dotenv from 'dotenv';
dotenv.config();

export const getApiUrl = (): string => process.env.API_URL??'http://localhost:3001';