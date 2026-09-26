import * as Handlebars from "handlebars";
import * as path from "path";
import * as fs from "fs";

export function registerMarketHelpers(hbs: typeof Handlebars, requestedGroups?: string[]) {
    // Mapping of category names to their local library files
    const libDir = path.join(__dirname, "lib");
    
    // If no groups requested, we could default to none or all.
    // For now, let's allow loading all if requested or if specific groups are named.
    const groupsToLoad = requestedGroups || [];
    
    if (groupsToLoad.length === 0) {
        // Default minimal set or just return
        return;
    }

    groupsToLoad.forEach(group => {
        const filePath = path.join(__dirname, "lib", `${group}.js`);
        if (fs.existsSync(filePath)) {
            try {
                // Since these are .js files extracted from the dump, we require them
                const helperModule = require(filePath);
                
                // handlebars-helpers files export an object of helpers
                if (helperModule && typeof helperModule === 'object') {
                    Object.keys(helperModule).forEach(name => {
                        hbs.registerHelper(name, helperModule[name]);
                    });
                }
            } catch (e) {
                console.error(`[TRACE:ARCHON:registry] Failed to load helper group: ${group}`, e);
            }
        }
    });
}
