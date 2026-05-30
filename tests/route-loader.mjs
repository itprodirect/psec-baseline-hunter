import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }

  if (specifier.startsWith("@/")) {
    const resolvedPath = resolveAliasPath(specifier);
    return {
      shortCircuit: true,
      url: pathToFileURL(resolvedPath).href,
    };
  }

  if (isRelativeSpecifier(specifier) && context.parentURL?.startsWith("file:")) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const resolvedPath = resolveSourcePath(path.resolve(parentDir, specifier));
    if (resolvedPath) {
      return {
        shortCircuit: true,
        url: pathToFileURL(resolvedPath).href,
      };
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && /\.(ts|tsx)$/.test(url)) {
    const source = fs.readFileSync(fileURLToPath(url), "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        isolatedModules: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
        verbatimModuleSyntax: false,
      },
      fileName: fileURLToPath(url),
    });

    return {
      format: "module",
      shortCircuit: true,
      source: transpiled.outputText,
    };
  }

  return nextLoad(url, context);
}

function resolveAliasPath(specifier) {
  const basePath = path.join(process.cwd(), "src", specifier.slice(2));
  return resolveSourcePath(basePath) || basePath;
}

function resolveSourcePath(basePath) {
  const candidates = [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    basePath,
  ];

  return candidates.find((candidate) => fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory());
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}
