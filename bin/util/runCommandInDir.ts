import child_process from "child_process";

export function runCommandInDir(dir: string, command: string) {
    return new Promise<string>((resolve, reject) => {
        child_process.exec(command, {
            cwd: dir
        }, (err, stdout) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(stdout);
        });
    });
}
