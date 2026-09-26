export const REGIONS_START_REGEX = /\/\/\s*@archon-manual-start:(\S+)/g;
export const REGIONS_END_REGEX = /\/\/\s*@archon-manual-end/g;

/**
 * Region Management (extracted from Archon Core)
 */
export function extractRegions(content) {
  const regions = new Map();
  let match;

  // 1. Comment-based
  REGIONS_START_REGEX.lastIndex = 0;
  while ((match = REGIONS_START_REGEX.exec(content)) !== null) {
    const id = match[1];
    const startIdx = match.index + match[0].length;
    REGIONS_END_REGEX.lastIndex = startIdx;
    const endMatch = REGIONS_END_REGEX.exec(content);
    if (endMatch) {
      regions.set(id, content.substring(startIdx, endMatch.index));
      REGIONS_START_REGEX.lastIndex = endMatch.index + endMatch[0].length;
    }
  }

  // 2. Decorator-based
  const decoratorRegex = /@ArchonManual\(\)\s*(?:async\s+)?(\w+)\s*\(/g;
  let decoMatch;
  while ((decoMatch = decoratorRegex.exec(content)) !== null) {
    const methodName = decoMatch[1];
    const decoratorStart = decoMatch.index;
    const bodyStartIdx = content.indexOf('{', decoMatch.index);
    if (bodyStartIdx !== -1) {
      const bodyEndIdx = findClosingBrace(content, bodyStartIdx);
      if (bodyEndIdx !== -1) {
        const fullBlock = content.substring(decoratorStart, bodyEndIdx + 1);
        regions.set(`decorator:${methodName}`, fullBlock);
        decoratorRegex.lastIndex = bodyEndIdx + 1;
      }
    }
  }

  return regions;
}

export function findClosingBrace(content, startIdx) {
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

export function mergeRegions(oldContent, newContent, filePath = "") {
  const oldRegions = extractRegions(oldContent);
  if (oldRegions.size === 0) return newContent;
  let merged = newContent;
  let mergedCount = 0;

  for (const [id, content] of oldRegions.entries()) {
    let isMerged = false;

    if (id.startsWith('decorator:')) {
      const methodName = id.split(':')[1];
      // Surgical Replace: find the method in the NEW content and replace it
      const methodPattern = `(?:async\\s+)?${methodName}\\s*\\([\\s\\S]*?\\)\\s*(?::\\s*[\\s\\S]*?)?\\{`;
      const methodRegex = new RegExp(methodPattern, 'g');
      
      const match = methodRegex.exec(merged);
      if (match) {
        const bodyStartIdx = match.index + match[0].length - 1; // last {
        const bodyEndIdx = findClosingBrace(merged, bodyStartIdx);
        if (bodyEndIdx !== -1) {
          const prefix = merged.substring(0, match.index);
          const suffix = merged.substring(bodyEndIdx + 1);
          merged = prefix + content + suffix;
          isMerged = true;
        }
      }

      if (!isMerged) {
        // Fallback: append to 'methods' manual region if it exists
        const methodsPattern = `(\\/\\/\\s*@archon-manual-start:methods)(\\s*[\\s\\S]*?)(\\/\\/\\s*@archon-manual-end)`;
        const methodsRegex = new RegExp(methodsPattern, 'g');
        if (methodsRegex.test(merged)) {
          merged = merged.replace(methodsRegex, (match, p1, p2, p3) => {
            if (p2.includes(content)) return match;
            return p1 + p2 + "\n" + content + "\n" + p3;
          });
          isMerged = true;
        }
      }
    } else {
      const escapedId = id.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const pattern = `(\\/\\/\\s*@archon-manual-start:${escapedId})(\\s*[\\s\\S]*?)(\\/\\/\\s*@archon-manual-end)`;
      const regex = new RegExp(pattern, 'g');
      
      if (regex.test(merged)) {
        merged = merged.replace(regex, (m, p1, p2, p3) => p1 + content + p3);
        isMerged = true;
      }
    }

    if (isMerged) {
      mergedCount++;
    } else {
      console.error(`  [WARNING] Manual region '${id}' could not be merged into ${filePath}. Target marker or method missing.`);
    }
  }

  if (mergedCount > 0) {
    console.error(`  - Merged ${mergedCount}/${oldRegions.size} manual regions in ${filePath}`);
  }

  return merged;
}
