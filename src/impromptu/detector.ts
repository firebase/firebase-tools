import * as fs from "fs-extra";
import * as path from "path";
import { BuildDetectionResult, TestDetectionResult } from "./types";

/**
 * Auto-detects build and test commands based on project files
 */
export class CommandDetector {
  /**
   * Detect build command for a workspace
   */
  async detectBuildCommand(workspaceDir: string): Promise<BuildDetectionResult> {
    // Check for various build configurations
    
    // Node.js / npm
    const packageJsonPath = path.join(workspaceDir, "package.json");
    if (await fs.pathExists(packageJsonPath)) {
      try {
        const packageJson = await fs.readJson(packageJsonPath);
        if (packageJson.scripts?.build) {
          return {
            detected: true,
            command: "npm run build",
            framework: "npm",
            configFile: "package.json",
          };
        }
      } catch {
        // Ignore parse errors
      }
    }
    
    // Angular
    const angularJsonPath = path.join(workspaceDir, "angular.json");
    if (await fs.pathExists(angularJsonPath)) {
      return {
        detected: true,
        command: "ng build",
        framework: "angular",
        configFile: "angular.json",
      };
    }
    
    // Nx
    const nxJsonPath = path.join(workspaceDir, "nx.json");
    if (await fs.pathExists(nxJsonPath)) {
      return {
        detected: true,
        command: "nx build",
        framework: "nx",
        configFile: "nx.json",
      };
    }
    
    // Dart with build_runner
    const buildYamlPath = path.join(workspaceDir, "build.yaml");
    const pubspecPath = path.join(workspaceDir, "pubspec.yaml");
    if (await fs.pathExists(buildYamlPath) && await fs.pathExists(pubspecPath)) {
      return {
        detected: true,
        command: "dart run build_runner build",
        framework: "dart-build_runner",
        configFile: "build.yaml",
      };
    }
    
    // Rust
    const cargoTomlPath = path.join(workspaceDir, "Cargo.toml");
    if (await fs.pathExists(cargoTomlPath)) {
      return {
        detected: true,
        command: "cargo build",
        framework: "rust",
        configFile: "Cargo.toml",
      };
    }
    
    // Go
    const goModPath = path.join(workspaceDir, "go.mod");
    if (await fs.pathExists(goModPath)) {
      return {
        detected: true,
        command: "go build ./...",
        framework: "go",
        configFile: "go.mod",
      };
    }
    
    // Gradle
    const gradlePath = path.join(workspaceDir, "build.gradle");
    const gradleKtsPath = path.join(workspaceDir, "build.gradle.kts");
    if (await fs.pathExists(gradlePath) || await fs.pathExists(gradleKtsPath)) {
      return {
        detected: true,
        command: "./gradlew build",
        framework: "gradle",
        configFile: await fs.pathExists(gradlePath) ? "build.gradle" : "build.gradle.kts",
      };
    }
    
    // Maven
    const pomPath = path.join(workspaceDir, "pom.xml");
    if (await fs.pathExists(pomPath)) {
      return {
        detected: true,
        command: "mvn compile",
        framework: "maven",
        configFile: "pom.xml",
      };
    }
    
    return { detected: false };
  }

  /**
   * Detect test command for a workspace
   */
  async detectTestCommand(workspaceDir: string): Promise<TestDetectionResult> {
    // Node.js / npm
    const packageJsonPath = path.join(workspaceDir, "package.json");
    if (await fs.pathExists(packageJsonPath)) {
      try {
        const packageJson = await fs.readJson(packageJsonPath);
        if (packageJson.scripts?.test) {
          return {
            detected: true,
            command: "npm test",
            framework: "npm",
            pattern: "**/*.{test,spec}.{js,ts,jsx,tsx}",
          };
        }
        
        // Check for specific test frameworks
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        if (deps.jest) {
          return {
            detected: true,
            command: "npx jest",
            framework: "jest",
            pattern: "**/*.{test,spec}.{js,ts,jsx,tsx}",
          };
        }
        if (deps.vitest) {
          return {
            detected: true,
            command: "npx vitest run",
            framework: "vitest",
            pattern: "**/*.{test,spec}.{js,ts,jsx,tsx}",
          };
        }
        if (deps.mocha) {
          return {
            detected: true,
            command: "npx mocha",
            framework: "mocha",
            pattern: "**/*.{test,spec}.{js,ts}",
          };
        }
      } catch {
        // Ignore parse errors
      }
    }
    
    // Angular
    const angularJsonPath = path.join(workspaceDir, "angular.json");
    if (await fs.pathExists(angularJsonPath)) {
      return {
        detected: true,
        command: "ng test --no-watch",
        framework: "angular",
        pattern: "**/*.spec.ts",
      };
    }
    
    // Dart
    const pubspecPath = path.join(workspaceDir, "pubspec.yaml");
    if (await fs.pathExists(pubspecPath)) {
      return {
        detected: true,
        command: "dart test",
        framework: "dart",
        pattern: "**/*_test.dart",
      };
    }
    
    // Rust
    const cargoTomlPath = path.join(workspaceDir, "Cargo.toml");
    if (await fs.pathExists(cargoTomlPath)) {
      return {
        detected: true,
        command: "cargo test",
        framework: "rust",
        pattern: "**/*_test.rs",
      };
    }
    
    // Go
    const goModPath = path.join(workspaceDir, "go.mod");
    if (await fs.pathExists(goModPath)) {
      return {
        detected: true,
        command: "go test ./...",
        framework: "go",
        pattern: "**/*_test.go",
      };
    }
    
    // Python
    const setupPyPath = path.join(workspaceDir, "setup.py");
    const pyprojectPath = path.join(workspaceDir, "pyproject.toml");
    const requirementsPath = path.join(workspaceDir, "requirements.txt");
    
    if (await fs.pathExists(setupPyPath) || await fs.pathExists(pyprojectPath) || await fs.pathExists(requirementsPath)) {
      // Check for pytest
      const pytestConfPath = path.join(workspaceDir, "pytest.ini");
      if (await fs.pathExists(pytestConfPath)) {
        return {
          detected: true,
          command: "pytest",
          framework: "pytest",
          pattern: "**/test_*.py",
        };
      }
      
      // Default to unittest
      return {
        detected: true,
        command: "python -m unittest discover",
        framework: "unittest",
        pattern: "**/test_*.py",
      };
    }
    
    // Gradle
    const gradlePath = path.join(workspaceDir, "build.gradle");
    const gradleKtsPath = path.join(workspaceDir, "build.gradle.kts");
    if (await fs.pathExists(gradlePath) || await fs.pathExists(gradleKtsPath)) {
      return {
        detected: true,
        command: "./gradlew test",
        framework: "gradle",
        pattern: "**/*Test.{java,kt}",
      };
    }
    
    // Maven
    const pomPath = path.join(workspaceDir, "pom.xml");
    if (await fs.pathExists(pomPath)) {
      return {
        detected: true,
        command: "mvn test",
        framework: "maven",
        pattern: "**/*Test.java",
      };
    }
    
    return { detected: false };
  }
}