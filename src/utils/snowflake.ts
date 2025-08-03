import { Sonyflake, Snowflake, DecomposedSonyflake } from 'sonyflake';

const sonyflake = new Sonyflake();

export const generateEventId = (): string => {
    return sonyflake.nextId();
};

export const getTimestampFromSnowflakeId = (snowflakeid:string) : number => {
    var decomposed:DecomposedSonyflake = sonyflake.decompose(snowflakeid);
    return decomposed.timestamp;
}

export const getDateFromSnowflakeId = (snowflakeid:string) : Date => {
    var decomposed:DecomposedSonyflake = sonyflake.decompose(snowflakeid);
    return new Date(decomposed.timestamp);
}