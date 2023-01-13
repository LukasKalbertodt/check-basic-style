import * as core from "@actions/core";
import * as glob from "glob";
import * as fs from "fs/promises";


// ====== Main functions =========================================================================

const main = async () => {
    const config = new Config();

    // Collect paths.
    const paths = new Set<string>();
    for (const pattern of config.files) {
        glob.sync(pattern, { nodir: true }).forEach(m => paths.add(m));
    }

    core.debug(`Will check these files: \n${Array.from(paths).map(p => `- ${p}`).join("\n")}`);

    // Run check for each path.
    let errors = false;
    for (const path of paths) {
        const outcome = await checkFile(path, config);
        errors ||= outcome === "error";
    }

    if (errors) {
        core.setFailed("Some problems were found");
    }
};

class Config {
    files: string[];
    assertSingleTrailingNewline: boolean;
    assertNoTrailingWhitespace: boolean;

    constructor() {
        this.files = core.getMultilineInput("files");
        this.assertSingleTrailingNewline = core.getBooleanInput("assert_single_trailing_newline");
        this.assertNoTrailingWhitespace = core.getBooleanInput("assert_no_trailing_whitespace");
    }
}

type Outcome = "error" | "ok";


const utf8Decoder = new TextDecoder("utf8", { fatal: true });

const checkFile = async (path: string, config: Config): Promise<Outcome> => {
    const content = await fs.readFile(path);

    // We always make sure the file is UTF-8 so that checks can operate on a
    // string instead of a byte buffer.
    let str;
    try {
        str = utf8Decoder.decode(content);
    } catch (e) {
        core.error(
            `File '${path}' is not encoded as UTF-8`,
            { file: path, title: "Not UTF-8 encoded" },
        );
        return "error";
    }

    // Our second always-on/mandatory check is for unix line endings. Other
    // checks can be way simpler if they can assume Unix line endings.
    const index = str.indexOf("\r");
    if (index !== -1) {
        const line = [...str.substring(0, index)].filter(c => c === "\n").length + 1;
        core.error(
            `File '${path}' contains '\\r' character (should use Unix line endings instead)`,
            { file: path, title: "'\\r' found", startLine: line },
        );
        return "error";
    }

    const outcomes = [];
    if (config.assertSingleTrailingNewline) {
        outcomes.push(checkSingleTrailingNewline(path, str));
    }
    if (config.assertNoTrailingWhitespace) {
        outcomes.push(checkTrailingWhitespace(path, str));
    }

    return outcomes.every(outcome => outcome === "ok") ? "ok" : "error";
};


// ====== Individual checks ======================================================================

const checkSingleTrailingNewline = (path: string, content: string): Outcome => {
    const error = (msg: string, line: number): "error" => {
        core.error(msg, {
            file: path,
            title: "Violation: Single trailing newline",
            startLine: line,
        });
        return "error";
    }

    // Empty files are allowed to have no newlines.
    if (content.length === 0) {
        return "ok";
    }

    const numNewlines = () => [...content].filter(c => c === "\n").length;
    if (content[content.length - 1] !== "\n") {
        return error(`File '${path}' does not end with a newline`, numNewlines() + 1);
    }

    // We want a _single_ trailing newline, if there is more than one byte in
    // this file.
    if (content.length > 1 && content[content.length - 2] === "\n") {
        return error(`File '${path}' contains more than one trailing newline`, numNewlines() + 1);
    }

    return "ok";
};

const checkTrailingWhitespace = (path: string, content: string): Outcome => {
    let error = false;
    content.split("\n").forEach((line, i) => {
        if (line.length !== line.trimEnd().length) {
            core.error("Line contains trailing whitespace", { file: path, startLine: i + 1 });
            error = true;
        }
    });

    return error ? "error": "ok";
};


// ====== Calling entry point ====================================================================

main()
    .catch(err => core.setFailed(`An error occured: ${err}`))
    .then(() => core.debug("Done"));
