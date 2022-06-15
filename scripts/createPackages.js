const pkg = require("pkg");
const jszip = require("jszip");
const fs = require("fs-extra");
const path = require("path");
const tar = require("tar");
const child_process = require("child_process");
const { extname } = require("path/posix");

function runCommandInDir(dir, command) {
  return new Promise((resolve, reject) => {
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

const baseBuildDir = path.resolve(__dirname, "..", "build");
const buildTargets = [ "latest-win-x64", "latest-linux-x64" ];
const outputExecutables = [ "hindenburg-win.exe", "hindenburg-linux" ];

const yarnVersion = "1.22.19";

(async () => {
  console.log("Creating build dir..");

  try {
    await fs.stat(baseBuildDir);
    await fs.rm(baseBuildDir, { recursive: true });
  } catch (e) {}

  await fs.mkdir(baseBuildDir);

  console.log("Building Hindenburg..");
  await runCommandInDir(path.resolve(__dirname, ".."), "yarn build");

  console.log("Installing yarn tarball to bundle..");
  const resultStdout = await runCommandInDir(baseBuildDir, "npm pack yarn@" + yarnVersion + " --json");
  const json = JSON.parse(resultStdout);

  console.log("Installed yarn tarball to yarn-%s.tgz", yarnVersion);

  await tar.x({
    file: path.resolve(baseBuildDir, "yarn-" + yarnVersion + ".tgz"),
    cwd: path.resolve(baseBuildDir)
  });

  const yarnInstallationDir = path.resolve(baseBuildDir, "yarn-v" + yarnVersion);

  await fs.rename(yarnInstallationDir, path.resolve(baseBuildDir, "yarn"));

  console.log("Creating packages..");
  await pkg.exec([ path.resolve(__dirname, ".."), "--targets", buildTargets.join(","), "--output", path.resolve(baseBuildDir, "hindenburg") ]);

  /*console.log("Creating archives..");
  for (const outputExecutable of outputExecutables) {
    console.log("Bundling %s..", outputExecutable);
    const zip = new jszip();
    
    zip.folder("yarn");
    zip.folder("yarn/bin");
    zip.folder("yarn/lib");

    zip.file("yarn/bin/yarn.js", fs.createReadStream(path.resolve(yarnInstallationDir, "bin", "yarn.js"), "utf8"));
    zip.file("yarn/lib/cli.js", fs.createReadStream(path.resolve(yarnInstallationDir, "lib", "cli.js"), "utf8"));
    zip.file("yarn/lib/v8-compile-cache.js", fs.createReadStream(path.resolve(yarnInstallationDir, "lib", "v8-compile-cache.js"), "utf8"));

    const extension = path.extname(outputExecutable);

    zip.file("hindenburg" + extension, fs.createReadStream(path.resolve(baseBuildDir, outputExecutable)));

    const contents = await zip.generateAsync({ type: "nodebuffer" });
    await fs.writeFile(path.resolve(baseBuildDir, path.basename(outputExecutable, extension) + ".zip"), contents);
  }*/

  console.log("Cleaning up..");
  const files = await fs.readdir(baseBuildDir);
  for (const file of files) {
    if (outputExecutables.includes(file))
      continue;

    await fs.rm(path.resolve(baseBuildDir, file), { recursive: true });
  }
})();
