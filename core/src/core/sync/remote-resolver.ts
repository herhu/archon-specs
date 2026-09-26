import { SpecCapsule, InjectionPack, CapsuleResolver } from '../registry/capsule';
import { logger } from '../telemetry/logger';
import * as fs from "fs-extra";
import * as path from "path";

export class FileCapsuleResolver implements CapsuleResolver {
    constructor(private readonly capsuleDir: string) {}

    async resolve(capsuleId: string): Promise<SpecCapsule | undefined> {
        const filePath = path.join(this.capsuleDir, `${capsuleId}.json`);
        if (await fs.pathExists(filePath)) {
            return await fs.readJson(filePath);
        }
        logger.warn({ capsuleId, filePath }, "Capsule not found on disk");
        return undefined;
    }

    async resolvePack(capsuleId: string): Promise<InjectionPack | undefined> {
        const filePath = path.join(this.capsuleDir, `${capsuleId}.pack.json`);
        if (await fs.pathExists(filePath)) {
            return await fs.readJson(filePath);
        }
        return undefined;
    }
}
