import * as core from "@actions/core";
import * as glob from "glob";
import isUtf8 from "isutf8";
import * as fs from "fs/promises";


// ====== Main functions =========================================================================

const main = async () => {
    const files = core.getMultilineInput("files");
    const assertUtf8 = core.getBooleanInput("assert_utf8");
    const assertSingleTrailingNewline = core.getBooleanInput("assert_single_trailing_newline");
    const assertUnixLineEndings = core.getBooleanInput("assert_unix_line_endings");

    let errors = false;
    if (assertUtf8) {
        core.startGroup("Make sure files are encoded as UTF-8");
        const outcome = await forAllFiles(files, checkUtf8);
        errors ||= outcome === "error";
        core.endGroup();
    }
    if (assertSingleTrailingNewline) {
        core.startGroup("Make sure files end in a single trailing newline");
        const outcome = await forAllFiles(files, checkSingleTrailingNewline);
        errors ||= outcome === "error";
        core.endGroup();
    }
    if (assertUnixLineEndings) {
        core.startGroup("Make sure files use Unix file endings");
        const outcome = await forAllFiles(files, checkUnixNewlines);
        errors ||= outcome === "error";
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

const NEWLINE_CHAR = "\n".charCodeAt(0);

const checkUtf8 = (path: string, buf: Buffer): Outcome => {
    if (!isUtf8(buf)) {
        core.error(
            `File '${path}' is not encoded as UTF-8`,
            { file: path, title: "Not UTF-8 encoded" },
        );
        return "error";
    }

    return "ok";
};

const checkSingleTrailingNewline = (path: string, buf: Buffer): Outcome => {
    const lastTwo = [...buf.subarray(buf.buffer.byteLength - 2)];
    const numNewlines = [...buf].filter(c => c === NEWLINE_CHAR).length;
    if (lastTwo[1] !== NEWLINE_CHAR) {
        core.error(
            `File '${path}' does not end with a newline`,
            { file: path, title: "Missing trailing newline", startLine: numNewlines + 1 },
        );
        return "error";
    }

    // We want a _single_ trailing newline
    if (lastTwo[0] === NEWLINE_CHAR) {
        core.error(
            `File '${path}' contains more than one trailing newline`,
            { file: path, title: "Extra trailing newline", startLine: numNewlines + 1 },
        );
        return "error";
    }


    return "ok";
};

const checkUnixNewlines = (path: string, buf: Buffer): Outcome => {
    const index = buf.indexOf("\r");
    if (index !== -1) {
        const line = [...buf.subarray(0, index)].filter(c => c === NEWLINE_CHAR).length + 1;
        core.error(
            `File '${path}' contains '\\r' character (should use Unix line endings instead)`,
            { file: path, title: "'\\r' found", startLine: line },
        );
        return "error";
    }

    return "ok";
};

// ====== Calling entry point ====================================================================

main()
    .catch(err => core.setFailed(`An error occured: ${err}`))
    .then(() => core.debug("Done"));
