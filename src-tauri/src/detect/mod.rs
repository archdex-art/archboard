//! Technology detection.
//!
//! Rule: read the top level of the project directory and, at most, one manifest
//! file. Never recurse, never parse, never execute. Adding a new stack means
//! adding one row to `MARKERS`.

use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;

struct Marker {
    /// Exact filename, or `*.ext` to match by extension.
    file: &'static str,
    language: &'static str,
    /// Manifest consulted for framework inference, when different from `file`.
    manifest: Option<&'static str>,
    package_manager: Option<&'static str>,
    /// Higher wins when a directory matches several markers.
    priority: u8,
}

const MARKERS: &[Marker] = &[
    Marker { file: "*.xcodeproj", language: "Swift", manifest: None, package_manager: Some("xcodebuild"), priority: 90 },
    Marker { file: "*.xcworkspace", language: "Swift", manifest: None, package_manager: Some("xcodebuild"), priority: 89 },
    Marker { file: "Package.swift", language: "Swift", manifest: Some("Package.swift"), package_manager: Some("swiftpm"), priority: 88 },
    Marker { file: "Cargo.toml", language: "Rust", manifest: Some("Cargo.toml"), package_manager: Some("cargo"), priority: 80 },
    Marker { file: "go.mod", language: "Go", manifest: Some("go.mod"), package_manager: Some("go"), priority: 80 },
    Marker { file: "pubspec.yaml", language: "Dart", manifest: Some("pubspec.yaml"), package_manager: Some("pub"), priority: 78 },
    Marker { file: "mix.exs", language: "Elixir", manifest: Some("mix.exs"), package_manager: Some("mix"), priority: 78 },
    Marker { file: "pyproject.toml", language: "Python", manifest: Some("pyproject.toml"), package_manager: None, priority: 76 },
    Marker { file: "requirements.txt", language: "Python", manifest: Some("requirements.txt"), package_manager: Some("pip"), priority: 70 },
    Marker { file: "Pipfile", language: "Python", manifest: Some("Pipfile"), package_manager: Some("pipenv"), priority: 71 },
    Marker { file: "setup.py", language: "Python", manifest: Some("setup.py"), package_manager: Some("pip"), priority: 68 },
    Marker { file: "deno.json", language: "TypeScript", manifest: Some("deno.json"), package_manager: Some("deno"), priority: 75 },
    Marker { file: "deno.jsonc", language: "TypeScript", manifest: Some("deno.jsonc"), package_manager: Some("deno"), priority: 75 },
    Marker { file: "package.json", language: "JavaScript", manifest: Some("package.json"), package_manager: None, priority: 74 },
    Marker { file: "pom.xml", language: "Java", manifest: Some("pom.xml"), package_manager: Some("maven"), priority: 72 },
    Marker { file: "build.gradle.kts", language: "Kotlin", manifest: Some("build.gradle.kts"), package_manager: Some("gradle"), priority: 72 },
    Marker { file: "build.gradle", language: "Java", manifest: Some("build.gradle"), package_manager: Some("gradle"), priority: 71 },
    Marker { file: "*.sln", language: "C#", manifest: None, package_manager: Some("dotnet"), priority: 70 },
    Marker { file: "*.csproj", language: "C#", manifest: None, package_manager: Some("dotnet"), priority: 69 },
    Marker { file: "Gemfile", language: "Ruby", manifest: Some("Gemfile"), package_manager: Some("bundler"), priority: 68 },
    Marker { file: "composer.json", language: "PHP", manifest: Some("composer.json"), package_manager: Some("composer"), priority: 68 },
    Marker { file: "CMakeLists.txt", language: "C/C++", manifest: None, package_manager: Some("cmake"), priority: 60 },
    Marker { file: "Makefile", language: "C/C++", manifest: None, package_manager: Some("make"), priority: 40 },
];

/// Lockfile → package manager, checked before falling back to npm.
const JS_LOCKFILES: &[(&str, &str)] = &[
    ("bun.lock", "bun"),
    ("bun.lockb", "bun"),
    ("pnpm-lock.yaml", "pnpm"),
    ("yarn.lock", "yarn"),
    ("package-lock.json", "npm"),
    ("deno.lock", "deno"),
];

const PY_LOCKFILES: &[(&str, &str)] = &[
    ("uv.lock", "uv"),
    ("poetry.lock", "poetry"),
    ("pdm.lock", "pdm"),
    ("Pipfile.lock", "pipenv"),
];

/// Dependency substring → framework label, per language.
const FRAMEWORKS: &[(&str, &[(&str, &str)])] = &[
    (
        "JavaScript",
        &[
            ("\"next\"", "Next.js"),
            ("\"nuxt\"", "Nuxt"),
            ("@sveltejs/kit", "SvelteKit"),
            ("\"@angular/core\"", "Angular"),
            ("\"astro\"", "Astro"),
            ("\"@remix-run/", "Remix"),
            ("@tauri-apps/api", "Tauri"),
            ("\"electron\"", "Electron"),
            ("\"react-native\"", "React Native"),
            ("\"expo\"", "Expo"),
            ("\"@nestjs/core\"", "NestJS"),
            ("\"express\"", "Express"),
            ("\"fastify\"", "Fastify"),
            ("\"svelte\"", "Svelte"),
            ("\"vue\"", "Vue"),
            ("\"solid-js\"", "Solid"),
            ("\"react\"", "React"),
        ],
    ),
    (
        "Python",
        &[
            ("django", "Django"),
            ("fastapi", "FastAPI"),
            ("flask", "Flask"),
            ("streamlit", "Streamlit"),
            ("torch", "PyTorch"),
        ],
    ),
    (
        "Rust",
        &[
            ("tauri", "Tauri"),
            ("axum", "Axum"),
            ("actix-web", "Actix"),
            ("bevy", "Bevy"),
            ("leptos", "Leptos"),
            ("rocket", "Rocket"),
        ],
    ),
    ("Ruby", &[("rails", "Rails"), ("sinatra", "Sinatra")]),
    ("PHP", &[("laravel/framework", "Laravel"), ("symfony/", "Symfony")]),
    ("Go", &[("gin-gonic/gin", "Gin"), ("labstack/echo", "Echo"), ("gofiber/fiber", "Fiber")]),
    ("Dart", &[("flutter", "Flutter")]),
    ("Java", &[("spring-boot", "Spring Boot"), ("com.android.application", "Android")]),
    ("Kotlin", &[("spring-boot", "Spring Boot"), ("com.android.application", "Android")]),
];

/// TypeScript is a property of a JS project, not a separate marker.
const TS_SIGNALS: &[&str] = &["tsconfig.json", "tsconfig.base.json"];

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detection {
    pub language: Option<String>,
    pub framework: Option<String>,
    pub package_manager: Option<String>,
    /// Extra capabilities worth a chip in the UI: docker, ci, tests, etc.
    pub tags: Vec<String>,
    pub has_git: bool,
}

const MANIFEST_READ_LIMIT: usize = 64 * 1024;

fn read_head(path: &Path, limit: usize) -> Option<String> {
    use std::io::Read;
    let mut buf = Vec::with_capacity(limit.min(8192));
    let f = std::fs::File::open(path).ok()?;
    f.take(limit as u64).read_to_end(&mut buf).ok()?;
    Some(String::from_utf8_lossy(&buf).into_owned())
}

pub fn detect(dir: &Path) -> Detection {
    let mut result = Detection::default();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return result;
    };

    let mut names: HashSet<String> = HashSet::new();
    let mut extensions: HashSet<String> = HashSet::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if let Some(ext) = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()) {
            extensions.insert(ext);
        }
        names.insert(name);
    }

    result.has_git = names.contains(".git");

    let matched = MARKERS
        .iter()
        .filter(|m| match m.file.strip_prefix("*.") {
            Some(ext) => extensions.contains(ext),
            None => names.contains(m.file),
        })
        .max_by_key(|m| m.priority);

    let Some(marker) = matched else {
        collect_tags(&names, &mut result);
        return result;
    };

    let mut language = marker.language.to_string();
    let mut package_manager = marker.package_manager.map(str::to_string);

    if marker.file == "package.json" {
        if TS_SIGNALS.iter().any(|s| names.contains(*s)) {
            language = "TypeScript".into();
        }
        package_manager = JS_LOCKFILES
            .iter()
            .find(|(f, _)| names.contains(*f))
            .map(|(_, pm)| pm.to_string())
            .or(Some("npm".into()));
    } else if language == "Python" && package_manager.is_none() {
        package_manager = PY_LOCKFILES
            .iter()
            .find(|(f, _)| names.contains(*f))
            .map(|(_, pm)| pm.to_string())
            .or(Some("pip".into()));
    }

    // Framework inference reads exactly one already-identified manifest.
    if let Some(manifest) = marker.manifest {
        if let Some(text) = read_head(&dir.join(manifest), MANIFEST_READ_LIMIT) {
            let lookup = if language == "TypeScript" { "JavaScript" } else { language.as_str() };
            if let Some((_, table)) = FRAMEWORKS.iter().find(|(l, _)| *l == lookup) {
                let lowered = text.to_ascii_lowercase();
                result.framework =
                    table.iter().find(|(needle, _)| lowered.contains(*needle)).map(|(_, f)| f.to_string());
            }
        }
    }

    result.language = Some(language);
    result.package_manager = package_manager;
    collect_tags(&names, &mut result);
    result
}

fn collect_tags(names: &HashSet<String>, result: &mut Detection) {
    let checks: &[(&[&str], &str)] = &[
        (&["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"], "docker"),
        (&[".github"], "github actions"),
        (&[".gitlab-ci.yml"], "gitlab ci"),
        (&[".circleci"], "circleci"),
        (&["Makefile", "Justfile", "justfile"], "task runner"),
        (&["turbo.json", "nx.json", "pnpm-workspace.yaml", "lerna.json"], "monorepo"),
        (&["README.md", "readme.md", "README", "README.mdx"], "readme"),
    ];
    for (files, tag) in checks {
        if files.iter().any(|f| names.contains(*f)) {
            result.tags.push(tag.to_string());
        }
    }
}

/// Finds the README so the detail view can preview it without a directory walk.
pub fn readme_preview(dir: &Path, limit: usize) -> Option<String> {
    for name in ["README.md", "readme.md", "README.MD", "Readme.md", "README", "README.txt"] {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return read_head(&candidate, limit);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(files: &[(&str, &str)]) -> std::path::PathBuf {
        let dir = std::env::temp_dir()
            .join(format!("archboard-detect-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&dir).unwrap();
        for (name, body) in files {
            std::fs::write(dir.join(name), body).unwrap();
        }
        dir
    }

    #[test]
    fn identifies_a_typescript_next_app_with_pnpm() {
        let dir = scratch(&[
            ("package.json", r#"{"dependencies":{"next":"15.0.0","react":"19.0.0"}}"#),
            ("tsconfig.json", "{}"),
            ("pnpm-lock.yaml", ""),
            ("Dockerfile", ""),
        ]);
        let d = detect(&dir);
        assert_eq!(d.language.as_deref(), Some("TypeScript"));
        assert_eq!(d.framework.as_deref(), Some("Next.js"));
        assert_eq!(d.package_manager.as_deref(), Some("pnpm"));
        assert!(d.tags.contains(&"docker".to_string()));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn prefers_the_higher_priority_marker_when_several_match() {
        // A Tauri app has both Cargo.toml and package.json; the app is Rust-led
        // only if Cargo.toml sits at the top level, which outranks package.json.
        let dir = scratch(&[
            ("Cargo.toml", "[dependencies]\ntauri = \"2\""),
            ("package.json", r#"{"dependencies":{"react":"19"}}"#),
        ]);
        let d = detect(&dir);
        assert_eq!(d.language.as_deref(), Some("Rust"));
        assert_eq!(d.framework.as_deref(), Some("Tauri"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reports_nothing_rather_than_guessing_on_an_empty_folder() {
        let dir = scratch(&[("notes.txt", "hello")]);
        let d = detect(&dir);
        assert!(d.language.is_none());
        assert!(d.framework.is_none());
        std::fs::remove_dir_all(&dir).ok();
    }
}
