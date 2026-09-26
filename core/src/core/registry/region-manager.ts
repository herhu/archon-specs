import { logger } from '../telemetry/logger';

export class RegionManager {
  private static readonly START_MARKER_REGEX = /\/\/\s*@archon-manual-start:(\S+)/g;
  private static readonly END_MARKER_REGEX = /\/\/\s*@archon-manual-end/g;

  /**
   * Extracts manual code blocks from a string.
   */
  public static extractRegions(content: string, filePath?: string): Map<string, string> {
    const regions = new Map<string, string>();
    let match;

    // 1. Extract Comment-based Regions
    this.START_MARKER_REGEX.lastIndex = 0;
    const fileRef = filePath ? ` in ${filePath}` : '';

    while ((match = this.START_MARKER_REGEX.exec(content)) !== null) {
      const regionId = match[1];
      const startIdx = match.index + match[0].length;
      
      if (regions.has(regionId)) {
        throw new Error(`Duplicate manual region ID '${regionId}' found${fileRef}.`);
      }

      this.END_MARKER_REGEX.lastIndex = startIdx;
      const endMatch = this.END_MARKER_REGEX.exec(content);
      
      if (!endMatch) {
        throw new Error(`Mismatched manual region markers: Start found for '${regionId}' but no End marker found${fileRef}.`);
      }

      const regionContent = content.substring(startIdx, endMatch.index);
      regions.set(regionId, regionContent);
      this.START_MARKER_REGEX.lastIndex = endMatch.index + endMatch[0].length;
    }

    // 2. Extract Decorator-based Regions (@ArchonManual)
    const decoratorRegex = /@ArchonManual\(\)\s*(?:async\s+)?(\w+)\s*\(/g;
    let decoMatch;
    while ((decoMatch = decoratorRegex.exec(content)) !== null) {
        const methodName = decoMatch[1];
        const decoratorStart = decoMatch.index;
        
        // Find the opening brace of the method body
        const bodyStartIdx = content.indexOf('{', decoMatch.index);
        if (bodyStartIdx !== -1) {
            const bodyEndIdx = this.findClosingBrace(content, bodyStartIdx);
            if (bodyEndIdx !== -1) {
                const fullBlock = content.substring(decoratorStart, bodyEndIdx + 1);
                regions.set(`decorator:${methodName}`, fullBlock);
                decoratorRegex.lastIndex = bodyEndIdx + 1;
            }
        }
    }

    return regions;
  }

  /**
   * Helper to find balanced closing brace
   */
  private static findClosingBrace(content: string, startIdx: number): number {
      let depth = 0;
      for (let i = startIdx; i < content.length; i++) {
          if (content[i] === '{') depth++;
          else if (content[i] === '}') {
              depth--;
              if (depth === 0) return i;
          }
      }
      return -1;
  }

  /**
   * Merges manual regions from oldContent into newContent.
   */
  public static merge(oldContent: string, newContent: string, filePath?: string): string {
    const oldRegions = this.extractRegions(oldContent, filePath);
    if (oldRegions.size === 0) return newContent;

    let mergedContent = newContent;
    const fileRef = filePath ? ` in ${filePath}` : '';
    let mergedCount = 0;

    for (const [id, content] of oldRegions.entries()) {
      let isMerged = false;

      if (id.startsWith('decorator:')) {
          const methodName = id.split(':')[1];
          // Surgical Replace: find the method in the NEW content and replace it
          const methodPattern = `(?:async\\s+)?${methodName}\\s*\\([\\s\\S]*?\\)\\s*(?::\\s*[\\s\\S]*?)?\\{`;
          const methodRegex = new RegExp(methodPattern, 'g');
          
          const match = methodRegex.exec(mergedContent);
          if (match) {
              const bodyStartIdx = match.index + match[0].length - 1; // last {
              const bodyEndIdx = this.findClosingBrace(mergedContent, bodyStartIdx);
              if (bodyEndIdx !== -1) {
                  const prefix = mergedContent.substring(0, match.index);
                  const suffix = mergedContent.substring(bodyEndIdx + 1);
                  mergedContent = prefix + content + suffix;
                  isMerged = true;
              }
          }

          if (!isMerged) {
              // Fallback: append to 'methods' manual region if it exists
              const methodsId = 'methods';
              const methodsPattern = `(\\/\\/\\s*@archon-manual-start:${methodsId})(\\s*[\\s\\S]*?)(\\/\\/\\s*@archon-manual-end)`;
              const methodsRegex = new RegExp(methodsPattern, 'g');
              
              if (methodsRegex.test(mergedContent)) {
                  mergedContent = mergedContent.replace(methodsRegex, (match, p1, p2, p3) => {
                      if (p2.includes(content)) return match;
                      return p1 + p2 + "\n" + content + "\n" + p3;
                  });
                  isMerged = true;
              }
          }
      } else {
          const escapedId = id.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const pattern = `(\\/\\/\\s*@archon-manual-start:${escapedId})(\\s*[\\s\\S]*?)(\\/\\/\\s*@archon-manual-end)`;
          const targetRegex = new RegExp(pattern, 'g');
          
          if (targetRegex.test(mergedContent)) {
              mergedContent = mergedContent.replace(targetRegex, (match, p1, p2, p3) => {
                  return p1 + content + p3;
              });
              isMerged = true;
          }
      }

      if (isMerged) {
          mergedCount++;
      } else {
          logger.warn(`Manual region '${id}' from existing file could not be merged into new content${fileRef}. The target marker or method may be missing.`);
      }
    }

    if (mergedCount > 0) {
        logger.debug(`Merged ${mergedCount}/${oldRegions.size} manual regions${fileRef}.`);
    }

    return mergedContent;
  }
}
