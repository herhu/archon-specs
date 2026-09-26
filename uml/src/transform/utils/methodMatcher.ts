
/**
 * Enterprise Method Matcher
 * Automatically infers HTTP methods and RESTful paths from UML message labels.
 */
export function inferMethodAndPath(label: string): { method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string } {
    const cleanLabel = label.split('(')[0].trim().toLowerCase();
    
    // Default
    let method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST';
    let path = `/${cleanLabel.replace(/\s+/g, '_')}`;

    if (cleanLabel.startsWith('get') || cleanLabel.startsWith('find') || cleanLabel.startsWith('search') || cleanLabel.startsWith('list')) {
        method = 'GET';
    } else if (cleanLabel.startsWith('create') || cleanLabel.startsWith('add') || cleanLabel.startsWith('post')) {
        method = 'POST';
    } else if (cleanLabel.startsWith('update') || cleanLabel.startsWith('patch')) {
        method = 'PATCH';
    } else if (cleanLabel.startsWith('save') || cleanLabel.startsWith('put') || cleanLabel.startsWith('set')) {
        method = 'PUT';
    } else if (cleanLabel.startsWith('delete') || cleanLabel.startsWith('remove') || cleanLabel.startsWith('destroy')) {
        method = 'DELETE';
    }

    // Infer path parameters from labels like "getUser(id)"
    const paramMatch = label.match(/\(([^)]+)\)/);
    if (paramMatch && (method === 'GET' || method === 'DELETE' || method === 'PATCH' || method === 'PUT')) {
        const params = paramMatch[1].split(',').map(p => p.trim());
        if (params.length > 0 && (params[0] === 'id' || params[0].endsWith('Id'))) {
            path = `${path}/:${params[0]}`;
        }
    }

    return { method, path };
}
