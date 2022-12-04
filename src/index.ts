import * as core from "@actions/core";
import * as glob from "glob";
import isUtf8 from "isutf8";
import * as fs from "fs/promises";


// ====== Main functions =========================================================================

const main = async () => {
    const files = core.getMultilineInput("files");
    const checkUtf8 = core.getBooleanInput("check_utf8");

    let errors = false;
    if (checkUtf8) {
        core.startGroup("Make sure files are encoded as UTF-8");
        errors ||= await forAllFiles(files, checkSingleUtf8) === "error";
        core.endGroup();
    }

    if (errors) {
        core.setFailed("Some problems were found");
    }
};

type Outcome = "error" | "ok";
type SingleCheck = (path: string, buf: Buffer) => Outcome;

/**
 * Takes a list of glob patterns and runs the given function for all files
 * matching those patterns. Function is called only once for each unique
 * path.
 */
const forAllFiles = async (files: string[], f: SingleCheck): Promise<Outcome> => {
    // Collect paths.
    const paths = new Set<string>();
    for (const pattern of files) {
        glob.sync(pattern, { nodir: true }).forEach(m => paths.add(m));
    }

    core.debug(`Will check these files: \n${Array.from(paths).map(p => `- ${p}`).join("\n")}`);

    // Run check for each path.
    let outcome: Outcome = "ok";
    for (const path of paths) {
        const content = await fs.readFile(path);
        const singleOutcome = f(path, content);
        if (singleOutcome === "error") {
            outcome = "error";
        }
    }
    return outcome;
};



// ====== Individual checks ======================================================================

const checkSingleUtf8 = (path: string, buf: Buffer): Outcome => {
    if (!isUtf8(buf)) {
        core.error(
            `File '${path}' is not encoded as UTF-8`,
            { file: path, title: "Not UTF-8 encoded" },
        );
        return "error";
    }

    return "ok";
};



// ====== Calling entry point ====================================================================

main()
    .catch(err => core.setFailed(`An error occured: ${err}`))
    .then(() => core.debug("Done"));
