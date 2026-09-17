import {
  getPublishablePackage,
  PUBLISHABLE_PACKAGES,
  type PublishablePackageName,
} from "./publishable-packages";

type Options = {
  packageName?: PublishablePackageName;
};

const printHelp = () => {
  console.log(`Usage: npm run build:packages -- [options]

Builds every publishable package by default.

Options:
  --package <name>  Build only @heswell/user-admin or @heswell/module-admin.
  --help            Print this help message.`);
};

const getOptionValue = (args: string[], index: number, flag: string) => {
  const inlineValue = args[index].slice(`${flag}=`.length);
  if (args[index].startsWith(`${flag}=`)) {
    if (!inlineValue) throw new Error(`The ${flag} option requires a value.`);
    return { nextIndex: index, value: inlineValue };
  }

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`The ${flag} option requires a value.`);
  }
  return { nextIndex: index + 1, value };
};

const parseOptions = (): Options => {
  const options: Options = {};
  const args = process.argv.slice(2);

  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--help") {
      printHelp();
      process.exit(0);
    }
    if (argument === "--package" || argument.startsWith("--package=")) {
      const { nextIndex, value } = getOptionValue(args, index, "--package");
      const selectedPackage = getPublishablePackage(value);
      if (!selectedPackage) {
        throw new Error(
          `Unsupported package "${value}". Use @heswell/user-admin or @heswell/module-admin.`,
        );
      }
      options.packageName = selectedPackage.name;
      index = nextIndex;
      continue;
    }
    throw new Error(`Unknown argument "${argument}". Use --help for usage.`);
  }

  return options;
};

const runNpm = (args: string[]) => {
  console.log(`> npm ${args.join(" ")}`);
  const result = Bun.spawnSync(["npm", ...args], {
    stderr: "inherit",
    stdout: "inherit",
  });

  if (result.exitCode !== 0) {
    throw new Error(`npm ${args[0]} failed with exit code ${result.exitCode}.`);
  }
};

const { packageName } = parseOptions();
const packagesToBuild = packageName
  ? [getPublishablePackage(packageName)!]
  : PUBLISHABLE_PACKAGES;

for (const { name } of packagesToBuild) {
  runNpm(["run", "build", "--workspace", name]);
}
