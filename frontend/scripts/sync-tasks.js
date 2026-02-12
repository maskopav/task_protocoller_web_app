/**
 * scripts/sync-tasks.js
 * Usage: 
 * node frontend/scripts/sync-tasks.js         
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';

// Paths - adjust to your structure
const TASKS_BASE_PATH = './frontend/src/config/tasksBase.ts';
const I18N_PATH = './frontend/src/i18n';
const LANGUAGES = ['en', 'cs']; 

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    magenta: "\x1b[35m",
    gray: "\x1b[90m"
};

/**
 * Extracts the taskBaseConfig object from the .ts file.
 * It finds the content between the first '{' and the last '};' 
 * after the variable declaration.
 */
function parseTsConfig(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Find where the object starts (after 'taskBaseConfig' and '=')
    const startMatch = content.match(/export const taskBaseConfig.*?\s*=\s*\{/);
    if (!startMatch) throw new Error(`Could not find 'export const taskBaseConfig' in ${filePath}`);
    
    const startIndex = content.indexOf('{', startMatch.index);
    // Find the last closing brace before the final semicolon
    const endIndex = content.lastIndexOf('};');
    
    if (startIndex === -1 || endIndex === -1) throw new Error("Could not find the object boundaries in .ts file");

    // Extract just the object string { ... }
    const objectStr = content.substring(startIndex, endIndex + 1);

    // Convert string to JS object. 
    // We wrap it in parentheses to treat it as an expression.
    // This is safe for local config files you control.
    try {
        return eval(`(${objectStr})`);
    } catch (err) {
        throw new Error(`Syntax error while evaluating tasksBase config: ${err.message}`);
    }
}

async function sync() {
    console.log("Starting Task Synchronization...");

    // 1. Load Source of Truth from .ts file
    let tasksBase;
    try {
        tasksBase = parseTsConfig(TASKS_BASE_PATH);
    } catch (err) {
        console.error(`${err.message}`);
        process.exit(1);
    }

    let hasErrors = false;

    for (const [category, config] of Object.entries(tasksBase)) {
        console.log(`\nChecking task: [${category}]`);
        const paramsConfig = config.params || {};
        const requiredParams = Object.keys(paramsConfig);

        for (const lang of LANGUAGES) {
            const transPath = path.join(I18N_PATH, lang, 'tasks.json');
            
            if (!fs.existsSync(transPath)) {
                console.error(`  ❌ [${lang}] Translation file missing: ${transPath}`);
                hasErrors = true;
                continue;
            }

            const trans = JSON.parse(fs.readFileSync(transPath, 'utf8'));

            if (!trans[category]) {
                console.error(`  ❌ [${lang}] Missing task definition for "${category}"`);
                hasErrors = true;
                continue;
            }

            // 1. Check if the parameter itself exists in translation
            requiredParams.forEach(pKey => {
                const transParam = trans[category].params?.[pKey];
                
                if (!transParam) {
                    console.error(`  ❌ [${lang}] Missing definition for parameter: "${pKey}"`);
                    hasErrors = true;
                    return;
                }

                // 2. If the parameter has a 'values' list in .ts, check if labels exist in .json
                const baseValues = paramsConfig[pKey].values;
                if (Array.isArray(baseValues)) {
                    const transValues = transParam.values || {};
                    
                    baseValues.forEach(valKey => {
                        if (!transValues[valKey]) {
                            console.error(` ❌ [${lang}] Missing translation for value "${valKey}" in parameter "${pKey}"`);
                            hasErrors = true;
                        }
                    });

                    // Optional: Check if translation has extra keys not defined in the base config
                    Object.keys(transValues).forEach(tKey => {
                        if (!baseValues.includes(tKey)) {
                            console.warn(`  ❌ [${lang}] Translation contains extra value "${tKey}" not found in tasksBase.ts`);
                        }
                    });
                }
            });
        }
    }

    if (hasErrors) {
        console.error("\n🛑 Validation failed. Fix the translation or config files first.");
        rl.close();
        process.exit(1);
    }

    console.log(`\n${colors.green}${colors.bright}✅ Validation passed.${colors.reset}`);
    
    console.log(`\n${colors.cyan}${colors.bright}${"=".repeat(60)}`);
    console.log("  DATABASE SYNCHRONIZATION STEPS");
    console.log(`${"=".repeat(60)}${colors.reset}`);

    const category = await question(`${colors.yellow}▶ Which task category do you want to sync? ${colors.reset}`);
    const config = tasksBase[category];

    if (!config) {
        console.error("❌ Task not found.");
    } else {
        // Prepare data strings
        const recordingMode = config.recording ? JSON.stringify(config.recording) : "NULL";
        const paramsList = JSON.stringify(Object.keys(config.params || {}));

        console.log(`\n${colors.magenta}${colors.bright}STEP 1: Check Task Type${colors.reset}`);
        console.log(`${colors.gray}Run this to ensure the '${config.type}' type exists and get its ID:${colors.reset}`);
        console.log(`${colors.bright}  SELECT id FROM task_types WHERE name = '${config.type}';${colors.reset}`);
        console.log(`${colors.gray}If no ID returns, create it first:${colors.reset}`);
        console.log(`${colors.bright}  INSERT IGNORE INTO task_types (name) VALUES ('${config.type}');${colors.reset}`);

        const typeId = await question(`\n${colors.yellow}▶ Enter the resulting type_id for '${config.type}': ${colors.reset}`);

        console.log(`\n${colors.magenta}${colors.bright}STEP 2: Sync Task Definition${colors.reset}`);
        console.log(`${colors.gray}Copy and run this command in your MySQL terminal:${colors.reset}`);
        
        console.log(`\n${colors.cyan}┌${"─".repeat(78)}┐${colors.reset}`);
        const sqlLines = [
            `INSERT INTO tasks (category, type_id, recording_mode, params, updated_at)`,
            `VALUES (`,
            `  '${category}',`,
            `  ${typeId},`,
            `  ${recordingMode !== "NULL" ? `'${recordingMode}'` : "NULL"},`,
            `  '${paramsList}',`,
            `  NOW()`,
            `)`,
            `ON DUPLICATE KEY UPDATE`,
            `  type_id = VALUES(type_id),`,
            `  recording_mode = VALUES(recording_mode),`,
            `  params = VALUES(params),`,
            `  updated_at = NOW();`
        ];

        sqlLines.forEach(line => console.log(`${colors.cyan}│${colors.reset} ${colors.bright}${line.padEnd(76)}${colors.reset} ${colors.cyan}│${colors.reset}`));
        console.log(`${colors.cyan}└${"─".repeat(78)}┘${colors.reset}`);
    }

    console.log(`\n${colors.cyan}${"=".repeat(80)}${colors.reset}\n`);
    rl.close();
}

sync();