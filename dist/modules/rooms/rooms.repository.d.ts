import Redis from 'ioredis';
import { Room } from './types/room.type';
import { User } from '../users/types/user.type';
export declare class RoomsRepository {
    private readonly client;
    constructor(client: Redis);
    save(room: Room, ttlSeconds?: number): Promise<void>;
    findById(roomUuid: string): Promise<Room>;
    delete(roomUuid: string): Promise<void>;
    saveUser(user: User): Promise<void>;
    findUserTokenBySocketId(socketId: string): Promise<string | null>;
    nextPublicUserId(roomUuid: string): Promise<number>;
    saveSocketMapping(socketId: string, roomUuid: string, userToken: string): Promise<void>;
    addUserToRoomList(roomUuid: string, userToken: string): Promise<void>;
    removeUserFromRoomList(roomUuid: string, userToken: string): Promise<void>;
    getUserTokensInRoom(roomUuid: string): Promise<string[]>;
    getUsersInRoom(roomUuid: string): Promise<User[]>;
    getUserCount(roomUuid: string): Promise<number>;
    getMappingBySocketId(socketId: string): Promise<{
        roomUuid: string;
        userToken: string;
    }>;
    findUserByToken(roomUuid: string, userToken: string): Promise<User>;
    findUserByTokenOrNull(roomUuid: string, token: string): Promise<User | null>;
    deleteUser(roomUuid: string, userToken: string, socketId?: string | null): Promise<void>;
    setUserTTL(roomUuid: string, userToken: string, ttlSeconds: number): Promise<void>;
    clearUserTTL(roomUuid: string, userToken: string): Promise<void>;
    deleteSocketMapping(socketId: string): Promise<void>;
    updateUserSocket(roomUuid: string, userToken: string, socketId: string | null): Promise<void>;
    addIpBan(roomUuid: string, ip: string): Promise<void>;
    isIpBanned(roomUuid: string, ip: string): Promise<boolean>;
}
