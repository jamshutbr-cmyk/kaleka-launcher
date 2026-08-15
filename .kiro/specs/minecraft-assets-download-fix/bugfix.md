# Bugfix Requirements Document

## Introduction

The `downloadVersion` function in `MinecraftAPI.ts` downloads the asset index JSON file but never downloads the actual asset object files. As a result, Minecraft fails to launch with `NoSuchFileException` errors for files like `assets/objects/15/15e3d77a4555455d752fde55b2661c159bee59ba`. This fix ensures all asset objects referenced by the index are downloaded to their correct paths before reporting download completion.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `downloadVersion` is called for any Minecraft version THEN the system downloads and saves the asset index JSON but does NOT download any asset object files from `https://resources.download.minecraft.net/{hash[0:2]}/{hash}`

1.2 WHEN the asset index download phase completes THEN the system reports 100% progress and marks the download as done without having downloaded any asset objects

1.3 WHEN Minecraft is launched after a version download THEN the system crashes with `NoSuchFileException` because asset object files are missing from `assets/objects/{hash[0:2]}/{hash}`

### Expected Behavior (Correct)

2.1 WHEN `downloadVersion` is called for any Minecraft version THEN the system SHALL iterate over all objects in the downloaded asset index and download each one from `https://resources.download.minecraft.net/{hash[0:2]}/{hash}` to `{ASSETS_DIR}/objects/{hash[0:2]}/{hash}`

2.2 WHEN an asset object file already exists at its target path THEN the system SHALL skip downloading that file and continue to the next object

2.3 WHEN asset objects are being downloaded THEN the system SHALL report progress between 80% and 100%, incrementing as each object is downloaded

2.4 WHEN all asset objects have been downloaded THEN the system SHALL report 100% progress and mark the download as complete

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `downloadVersion` downloads the Minecraft client JAR THEN the system SHALL CONTINUE TO save it to `{VERSIONS_DIR}/{versionId}/{versionId}.jar` and report progress between 10% and 50%

3.2 WHEN `downloadVersion` downloads library files THEN the system SHALL CONTINUE TO save each artifact to its path under `{LIBRARIES_DIR}` and report progress between 50% and 80%

3.3 WHEN `downloadVersion` downloads the asset index JSON THEN the system SHALL CONTINUE TO save it to `{ASSETS_DIR}/indexes/{assetIndex.id}.json`

3.4 WHEN an asset object file already exists on disk THEN the system SHALL CONTINUE TO skip re-downloading it (consistent with existing skip-if-exists behavior for the client JAR and libraries)

3.5 WHEN `downloadVersion` is called for a version that has already been fully downloaded THEN the system SHALL CONTINUE TO skip all already-present files and complete without re-downloading anything
