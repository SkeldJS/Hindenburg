const pkg = require("pkg");
const fs = require("fs-extra");
const path = require("path");
const tar = require("tar");
const child_process = require("child_process");

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

const baseWaterwayDir = path.resolve(__dirname, "..");
const baseBuildDir = path.resolve(baseWaterwayDir, "release");
const buildTargets = [ "latest-win-x64", "latest-linux-x64" ];
const outputExecutables = [ "waterway-win.exe", "waterway-linux" ];

const yarnVersion = "1.22.19";

(async () => {
  console.log("Creating release dir..");

  try {
    await fs.stat(baseBuildDir);
    await fs.rm(baseBuildDir, { recursive: true });
  } catch (e) {}

  await fs.mkdir(baseBuildDir);

  console.log("Building Waterway..");
  await runCommandInDir(baseWaterwayDir, "yarn build");

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

  console.log("Creating releases..");
  await pkg.exec([ baseWaterwayDir, "--targets", buildTargets.join(","), "--output", path.resolve(baseBuildDir, "waterway") ]);

  console.log("Cleaning up..");
  const files = await fs.readdir(baseBuildDir);
  for (const file of files) {
    if (outputExecutables.includes(file))
      continue;

    await fs.rm(path.resolve(baseBuildDir, file), { recursive: true });
  }

  console.log("Creating release body..");
  const changelogJson = JSON.parse(await fs.readFile(path.resolve(baseWaterwayDir, "changelog.json"), "utf8"));
  const latestVersionId = (process.argv[2] ? process.argv[2].split("/")[2] : "") || await runCommandInDir(baseWaterwayDir, "git describe --tags --abbrev=0");
  const latestChanges = changelogJson[latestVersionId.trim()];

  let releaseBody = "";
  for (const note of latestChanges.notes)  {
    releaseBody += "\n- " + note.description + (note.commits ? " (" + note.commits.join(", ") + ")" : "");
  }
  await fs.writeFile(path.resolve(baseBuildDir, "body.txt"), releaseBody.trim(), "utf8");
})();
