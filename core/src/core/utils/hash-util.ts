import { Project, SyntaxKind } from 'ts-morph';
import * as crypto from 'crypto';

/**
 * HashUtil provides semantic-aware hashing for Archon artifacts.
 */
export class HashUtil {
    private static project = new Project({ useInMemoryFileSystem: true });

    /**
     * Calculates a standard SHA-256 hash of the content.
     */
    static calculateHash(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Calculates a 'Masked Hash' by identifying protected blocks (@ArchonManual)
     * and replacing their content with a stable placeholder before hashing.
     */
    static calculateMaskedHash(filePath: string, content: string): string {
        // Only TypeScript files currently support semantic masking
        if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) {
            return this.calculateHash(content);
        }

        try {
            // Use a transient project to avoid memory leaks
            const project = new Project({ useInMemoryFileSystem: true });
            const sourceFile = project.createSourceFile('temp.ts', content);

            // Identify and mask protected methods
            sourceFile.getClasses().forEach(cls => {
                cls.getMethods().forEach(method => {
                    if (method.getDecorator('ArchonManual')) {
                        // Mask the body of the method
                        method.setBodyText('/* ARCHON_MANUAL_PROTECTED */');
                    }
                });

                // Check if the whole class is protected
                if (cls.getDecorator('ArchonManual')) {
                    cls.getProperties().forEach(p => p.remove());
                    cls.getMethods().forEach(m => m.remove());
                    cls.addMethod({ name: 'protectedByArchon', statements: '/* ARCHON_MANUAL_CLASS_PROTECTED */' });
                }
            });

            const maskedContent = sourceFile.getFullText();
            sourceFile.forget();
            
            return this.calculateHash(maskedContent);
        } catch (err) {
            // Fallback to standard hash if parsing fails
        }
    }

    /**
     * Calculates a deterministic fingerprint for an object.
     * Recursively sorts keys to ensure bit-identity.
     */
    static calculateObjectFingerprint(obj: any): string {
        const canonicalize = (val: any): any => {
            if (val === null || typeof val !== 'object') return val;
            if (Array.isArray(val)) return val.map(canonicalize);
            
            return Object.keys(val).sort().reduce((acc: any, key) => {
                acc[key] = canonicalize(val[key]);
                return acc;
            }, {});
        };

        const canonical = canonicalize(obj);
        return this.calculateHash(JSON.stringify(canonical));
    }
}
