import { Sonyflake } from 'sonyflake';

const sonyflake = new Sonyflake();

export const generateEventId = (): string => {
    return sonyflake.nextId().toString();
};
