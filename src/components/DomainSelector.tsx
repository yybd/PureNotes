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
    style?: any;
}

export const DomainSelector: React.FC<DomainSelectorProps> = ({ selectedDomain, onSelectDomain, mode = 'select', compact = false, style }) => {
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
                    style={[styles.chip, styles.clearChip]}
                    onPress={() => onSelectDomain(null)}
                >
                    <Ionicons name="close-circle" size={16} color="#666" />
                    <Text style={styles.clearText}>{t('clear')}</Text>
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
                                backgroundColor: isSelected ? config.color : config.color + '15',
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
                            isSelected ? { color: '#FFFFFF', fontWeight: '700' } : { color: config.color, fontWeight: '500' },
                        ]}>
                            {t(`domain_${domain}`)}
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
    },
    collapsedRow: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        flexDirection: 'row',
    },
    selectScrollView: {
        maxHeight: 50,
        marginBottom: 8,
    },
    filterScrollView: {
        maxHeight: 50,
        backgroundColor: 'transparent',
    },
    chip: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        marginRight: 8,
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
});
