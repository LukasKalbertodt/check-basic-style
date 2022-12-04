import * as core from "@actions/core";

const main = () => {
    const files = core.getMultilineInput("files");
    const checkUtf8 = core.getBooleanInput("check_utf8");

    console.log(files);
    console.log(checkUtf8);
};


try {
    main();
} catch(err) {
    core.setFailed(`An error occured: ${err}`);
}
