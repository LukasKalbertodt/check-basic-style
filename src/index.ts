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

type ReportError = (title: string, note: string, line?: number) => "error";


const utf8Decoder = new TextDecoder("utf8", { fatal: true });

const checkFile = async (path: string, config: Config): Promise<Outcome> => {
    const reportError: ReportError = (msg, note, line) => {
        core.error(note, {
            file: path,
            title: msg,
            startLine: line,
        });

        // We print an additional error to the terminal so that the action log
        // contains all necessary information without forcing us to put
        // superfluous information in the annotation text.
        console.error(`Problem in '${path}${line == null ? "" : `:${line}`}': ${msg} (${note})`);

        return "error";
    };

    const content = await fs.readFile(path);

    // We always make sure the file is UTF-8 so that checks can operate on a
    // string instead of a byte buffer.
    let str;
    try {
        str = utf8Decoder.decode(content);
    } catch (e) {
        return reportError("Not UTF-8 encoded", "File is not encoded as valid UTF-8");
    }

    // Our second always-on/mandatory check is for unix line endings. Other
    // checks can be way simpler if they can assume Unix line endings.
    const index = str.indexOf("\r");
    if (index !== -1) {
        const line = [...str.substring(0, index)].filter(c => c === "\n").length + 1;
        return reportError(
            "Non-Unix line ending ('\\r') found",
            "'\\r' character found, should only use Unix line endings ('\\n') instead",
            line,
        );
    }


    const outcomes = [];
    if (config.assertSingleTrailingNewline) {
        outcomes.push(checkSingleTrailingNewline(str, reportError));
    }
    if (config.assertNoTrailingWhitespace) {
        outcomes.push(checkTrailingWhitespace(str, reportError));
    }

    return outcomes.every(outcome => outcome === "ok") ? "ok" : "error";
};


// ====== Individual checks ======================================================================

const checkSingleTrailingNewline = (content: string, error: ReportError): Outcome => {
    // Empty files are allowed to have no newlines.
    if (content.length === 0) {
        return "ok";
    }

    const numNewlines = () => [...content].filter(c => c === "\n").length;
    if (content[content.length - 1] !== "\n") {
        return error(`Missing trailing newline`,
            "File does not end with newline",
            numNewlines() + 1,
        );
    }

    // We want a _single_ trailing newline, if there is more than one byte in
    // this file.
    if (content.length > 1 && content[content.length - 2] === "\n") {
        return error("Multiple trailing newlines",
            "File contains more than one newline at the end",
            numNewlines() + 1,
        );
    }

    return "ok";
};

const checkTrailingWhitespace = (content: string, error: ReportError): Outcome => {
    let outcome: Outcome = "ok";
    content.split("\n").forEach((line, i) => {
        if (line.length !== line.trimEnd().length) {
            error(
                "Line with trailing whitespace",
                "Line ends with whitespace characters which should be removed",
                i + 1,
            );
            outcome = "error";
        }
    });

    return outcome;
};


// ====== Calling entry point ====================================================================

main()
    .catch(err => core.setFailed(`An error occured: ${err}`))
    .then(() => core.debug("Done"));
