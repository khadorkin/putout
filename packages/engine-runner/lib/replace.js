'use strict';

const {isProgram} = require('@babel/types');
const {template} = require('@putout/engine-parser');
const {replaceWith} = require('@putout/operate');
const {
    compare,
    findVarsWays,
    getValues,
    setValues,
} = require('@putout/compare');

const maybeArray = require('./maybe-array');
const findPath = require('./find-path');

const {keys, entries} = Object;

const stub = () => [];
const stubMatch = () => ({});
const packKeys = (a) => () => keys(a);

module.exports = ({rule, plugin, msg, options}, {}) => {
    const {
        report,
        exclude = stub,
        replace,
        filter = getFilter(plugin.match),
    } = plugin;
    
    const replaceItems = replace();
    const fix = getFix(replaceItems);
    const include = packKeys(replaceItems);
    
    return {
        rule,
        msg,
        options: {
            ...options,
            exclude: [
                ...exclude(),
                ...maybeArray(options.exclude),
            ],
        },
        plugin: {
            report,
            fix,
            filter,
            include,
        },
    };
};

const isFn = (a) => typeof a === 'function';
const parseTo = (to, values, path) => isFn(to) ? to(values, path) : to;

const fix = (from, to, path) => {
    const nodeFrom = template.ast(from);
    const watermark = `${from} -> ${to}`;
    const highWatermark = `${watermark} :> ${findPath(path)}`;
    
    path._putout = path._putout || [];
    
    const file = path.findParent(isProgram);
    file._putout = file._putout || [];
    
    if (path._putout.includes(watermark))
        return;
    
    if (file._putout.includes(highWatermark))
        return;
    
    if (!compare(path, nodeFrom))
        return;
    
    if (!to)
        return path.remove();
    
    const waysFrom = findVarsWays(nodeFrom);
    const {node} = path;
    
    const values = getValues({
        waysFrom,
        node,
    });
    
    const toStr = parseTo(to, values, path);
    const nodeTo = template.ast.fresh(toStr);
    const waysTo = findVarsWays(nodeTo);
    const newPath = replaceWith(path, nodeTo);
    
    setValues({
        waysTo,
        values,
        path: newPath,
    });
    
    path._putout.push(watermark);
    file._putout.push(highWatermark);
};

const getFix = (items) => (path) => {
    for (const [from, to] of entries(items))
        fix(from, to, path);
};

const getFilter = (match = stubMatch) => (path) => {
    for (const [from, fn] of entries(match())) {
        const nodeFrom = template.ast(from);
        
        if (!compare(path, nodeFrom)) {
            continue;
        }
        
        const waysFrom = findVarsWays(nodeFrom);
        const {node} = path;
        
        const values = getValues({
            waysFrom,
            node,
        });
        
        return fn(values, path);
    }
    
    return true;
};

