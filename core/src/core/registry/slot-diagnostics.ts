import { ResolvedBinding } from './semantic-linker';
import { logger } from '../telemetry/logger';
import chalk = require("chalk");

export class SlotDiagnostics {
    trace(bindings: ResolvedBinding[]): void {
        console.error(chalk.bold.yellow("\n🔍 Archon Slot Diagnostics"));
        
        for (const rb of bindings) {
            console.error(chalk.cyan(`\n📍 Slot: ${rb.slot.id}`));
            console.error(`   Kind:    ${rb.slot.kind}`);
            console.error(`   File:    ${rb.slot.targetFile}`);
            console.error(`   Capsule: ${chalk.magenta(rb.capsuleId)}`);
            
            if (rb.value && typeof rb.value === "object" && rb.value.symbol) {
                console.error(`   Value:   Symbol(${chalk.green(rb.value.symbol)})`);
                if (rb.value.resolvedPath) {
                    console.error(`   Source:  ${rb.value.resolvedPath}`);
                }
            } else {
                console.error(`   Value:   ${JSON.stringify(rb.value)}`);
            }
        }
        
        console.error(chalk.bold.yellow("\n---------------------------"));
    }
}
