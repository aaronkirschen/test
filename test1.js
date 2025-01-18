window.custom = function() {
    'use strict';

    const defaultConfig = {
        LOG_LEVEL: "debug",
        MAX_RETRIES: 10,
        RETRY_DELAY: 500,
    };

    let config = {...defaultConfig};
    let retryCount = 0;

    const log = {
        _shouldLog(level) {
            const levels = ["debug", "info", "warn", "error", "none"];
            return levels.indexOf(level) >= levels.indexOf(config.LOG_LEVEL);
        },
        debug(...args) { if (this._shouldLog("debug")) console.debug('[CustomJS]', ...args); },
        info(...args) { if (this._shouldLog("info")) console.info('[CustomJS]', ...args); },
        warn(...args) { if (this._shouldLog("warn")) console.warn('[CustomJS]', ...args); },
        error(...args) { if (this._shouldLog("error")) console.error('[CustomJS]', ...args); }
    };

    function validateTrajectory(trajectory) {
        return trajectory &&
            typeof trajectory === "object" &&
            "uuid" in trajectory &&
            "steps" in trajectory;
    }

    function getTrajectoryFromWindow(basePath = "hybrid.forms.validations", preferredPathSubstring = ".props.taskResponse.questions") {
        const visited = new Set();
        const results = [];

        function getObjectByPath(baseObject, path) {
            return path.split(".").reduce((obj, key) => {
                return obj && obj[key] ? obj[key] : null;
            }, baseObject);
        }

        function recursiveSearch(obj, path = "") {
            if (!obj || visited.has(obj)) return;
            visited.add(obj);

            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const value = obj[key];
                    const currentPath = path ? `${path}.${key}` : key;

                    if (key === "questions" && typeof value === "object" && value !== null) {
                        results.push({path: currentPath, value});
                    }

                    if (value && typeof value === "object") {
                        recursiveSearch(value, currentPath);
                    }
                }
            }
        }

        try {
            const baseObject = basePath ? getObjectByPath(window, basePath) : window;
            if (!baseObject) {
                log.warn(`Base object not found at path '${basePath}'`);
                return null;
            }

            recursiveSearch(baseObject);

            if (results.length === 0) {
                log.warn("No 'questions' objects found during recursive search.");
                return null;
            }

            const preferredResults = results.filter(({path}) => path.includes(preferredPathSubstring));
            const fallbackResults = results.filter(({path}) => !path.includes(preferredPathSubstring));
            const prioritizedResults = [...preferredResults, ...fallbackResults];

            for (const {path, value} of prioritizedResults) {
                log.debug(`Inspecting 'questions' at path: ${path}`);
                if (typeof value === "object" && value !== null) {
                    for (const [key, entry] of Object.entries(value)) {
                        try {
                            if (entry?.item_type === "fr" && entry?.text) {
                                const parsed = JSON.parse(entry.text);
                                if (validateTrajectory(parsed)) {
                                    log.debug(`Valid trajectory found at path: ${path}.${key}`);
                                    return parsed;
                                }
                            }
                        } catch (error) {
                            log.warn(`Failed to parse entry at path: ${path}.${key}`, error);
                        }
                    }
                }
            }
        } catch (error) {
            log.error("Search failed:", error);
        }

        return null;
    }

    function getTrajectory() {
        // Try the specific path first
        const trajectoryData = getTrajectoryFromWindow();
        if (trajectoryData) {
            log.debug("Trajectory found via specific path");
            return trajectoryData;
        }

        // Fall back to searching everywhere in window
        const fallbackData = getTrajectoryFromWindow("", ".props.taskResponse.questions");
        if (fallbackData) {
            log.debug("Trajectory found via global search");
            return fallbackData;
        }

        return null;
    }

    function attemptInitialization() {
        log.debug(`Attempt ${retryCount + 1} of ${config.MAX_RETRIES}`);

        const trajectoryData = getTrajectory();

        if (trajectoryData) {
            log.info('Successfully found trajectory data:', trajectoryData);
            return true;
        }

        retryCount++;

        if (retryCount < config.MAX_RETRIES) {
            log.debug(`Trajectory not found, retrying in ${config.RETRY_DELAY}ms...`);
            setTimeout(attemptInitialization, config.RETRY_DELAY);
            return false;
        } else {
            log.error('Failed to find trajectory data after maximum retries');
            return false;
        }
    }

    // Initialize only on full page load
    if (document.readyState === "complete") {
        log.debug('Document complete, initializing');
        retryCount = 0;
        attemptInitialization();
    } else {
        window.addEventListener("load", () => {
            log.debug('Window load fired');
            retryCount = 0;
            attemptInitialization();
        });
    }
};
