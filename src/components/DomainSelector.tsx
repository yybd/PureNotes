import React, { useState } from 'react';
import { ScrollView, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { DomainType, DOMAINS } from '../types/Note';

interface DomainSelectorProps {
    selectedDomain: DomainType | null;
    onSelectDomain: (domain: DomainType | null) => void;
    mode?: 'select' | 'filter';
    /** When true, shows only the selected chip and expands on tap. */
    compact?: boolean;
    domainCounts?: Record<DomainType, number>;
    style?: any;
}

export const DomainSelector: React.FC<DomainSelectorProps> = ({ selectedDomain, onSelectDomain, mode = 'select', compact = false, domainCounts, style }) => {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);

    const isCollapsible = compact;
    const isCollapsed = isCollapsible && !expanded;

    const handleSelect = (domain: DomainType) => {
        const isSelected = selectedDomain === domain;
        onSelectDomain(isSelected ? null : domain);
        if (isCollapsible) setExpanded(false);
    };

    // ── Collapsed state (select mode only) ──
    if (isCollapsed) {
        if (selectedDomain && DOMAINS[selectedDomain]) {
            const config = DOMAINS[selectedDomain];
            return (
                <View style={[styles.collapsedRow, style]}>
                    <TouchableOpacity
                        style={[styles.chip, { borderColor: config.color, backgroundColor: config.color }]}
                        onPress={() => setExpanded(true)}
                    >
                        <Ionicons name="chevron-down" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Ionicons name={config.icon as any} size={16} color="#FFFFFF" style={styles.icon} />
                        <Text style={[styles.label, { color: '#FFFFFF', fontWeight: '700' }]}>{t(`domain_${selectedDomain}`)}</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        return (
            <View style={[styles.collapsedRow, style]}>
                <TouchableOpacity
                    style={[styles.chip, styles.placeholderChip]}
                    onPress={() => setExpanded(true)}
                >
                    <Ionicons name="chevron-down" size={14} color="#999" style={{ marginRight: 4 }} />
                    <Ionicons name="pricetag-outline" size={16} color="#999" style={styles.icon} />
                    <Text style={[styles.label, { color: '#999' }]}>{t('select_domain')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ── Expanded state / filter mode ──
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.container}
            style={[mode === 'filter' ? styles.filterScrollView : styles.selectScrollView, style]}
            keyboardShouldPersistTaps="always"
        >
            {mode === 'filter' && selectedDomain && (
                <TouchableOpacity
                    style={[styles.chip, styles.clearChip, styles.clearChipIconOnly]}
                    onPress={() => onSelectDomain(null)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Ionicons name="close-circle" size={22} color="#666" />
                </TouchableOpacity>
            )}

            {(Object.keys(DOMAINS) as DomainType[]).map((domain) => {
                const config = DOMAINS[domain];
                const isSelected = selectedDomain === domain;

                return (
                    <TouchableOpacity
                        key={domain}
                        style={[
                            styles.chip,
                            {
                                borderColor: config.color,
                                backgroundColor: isSelected ? config.color : 'transparent',
                            },
                        ]}
                        onPress={() => handleSelect(domain)}
                    >
                        <Ionicons
                            name={config.icon as any}
                            size={16}
                            color={isSelected ? '#FFFFFF' : config.color}
                            style={styles.icon}
                        />
                        <Text style={[
                            styles.label,
                            { color: isSelected ? '#FFFFFF' : config.color, fontWeight: isSelected ? '700' : '500' },
                        ]}>
                            {t(`domain_${domain}`)}
                            {domainCounts && domainCounts[domain] !== undefined && (
                                <Text style={[
                                    styles.countText,
                                    { color: isSelected ? '#FFFFFF' : config.color }
                                ]}> ({domainCounts[domain]})</Text>
                            )}
                        </Text>
                    </TouchableOpacity>
                );
            })}

            {/* Collapse button in select mode */}
            {isCollapsible && (
                <TouchableOpacity
                    style={[styles.chip, { borderColor: '#ccc', backgroundColor: '#f0f0f0' }]}
                    onPress={() => setExpanded(false)}
                >
                    <Ionicons name="chevron-up" size={16} color="#666" />
                </TouchableOpacity>
            )}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        flexGrow: 1,
    },
    collapsedRow: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        flexDirection: 'row',
    },
    selectScrollView: {
        maxHeight: 70,
        marginBottom: 8,
        width: '100%',
    },
    filterScrollView: {
        maxHeight: 70,
        backgroundColor: 'transparent',
        width: '100%',
    },
    chip: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        marginHorizontal: 4,
        marginVertical: 4,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    placeholderChip: {
        backgroundColor: '#f0f0f0',
        borderColor: '#ddd',
    },
    clearChip: {
        backgroundColor: '#eee',
        borderColor: '#ddd',
    },
    icon: {
        marginLeft: 6,
    },
    label: {
        fontSize: 14,
    },
    clearText: {
        fontSize: 14,
        color: '#666',
        marginLeft: 4,
    },
    clearChipIconOnly: {
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRadius: 20,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    countText: {
        fontSize: 11,
        opacity: 0.8,
        fontWeight: 'normal',
    },
});
