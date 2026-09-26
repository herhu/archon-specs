
/**
 * Enterprise Cardinality Matcher
 * Normalizes UML multiplicities into standard types and optionality flags.
 */
export function parseCardinality(mult: string): { isMany: boolean, isOptional: boolean } {
    const m = mult.toLowerCase().trim();
    
    const isMany = m.includes('*') || m.includes('many');
    const isOptional = m.startsWith('0') || m.includes('0..') || m.includes('..*'); // "*" usually implies 0..* in UML if not specified

    return { isMany, isOptional };
}

export type RelType = 'manyToOne' | 'oneToMany' | 'oneToOne' | 'manyToMany';

export function determineRelTypes(fromMult: string, toMult: string): { forward: RelType, backward: RelType } {
    const from = parseCardinality(fromMult);
    const to = parseCardinality(toMult);

    if (from.isMany && to.isMany) return { forward: 'manyToMany', backward: 'manyToMany' };
    if (!from.isMany && !to.isMany) return { forward: 'oneToOne', backward: 'oneToOne' };
    
    if (!from.isMany && to.isMany) return { forward: 'oneToMany', backward: 'manyToOne' };
    
    // from.isMany && !to.isMany
    return { forward: 'manyToOne', backward: 'oneToMany' };
}
