import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RTL_TEXT_STYLE } from '../utils/rtlUtils';
import { SearchBar } from './SearchBar';
import { DomainSelector } from './DomainSelector';
import { DomainType } from '../types/Note';

interface HeaderProps {
    title: string;
    onSettingsPress: () => void;
    // Search Props
    onSearch: (query: string) => void;
    onSearchFocus: () => void;
    onSearchBlur: () => void;
    isSearchFocused: boolean;
    // Domain Filter Props
    currentDomain: DomainType | null;
    onFilterByDomain: (domain: DomainType | null) => void;
    domainCounts?: Record<DomainType, number>;
    // Visibility
    hideSearchAndDomain?: boolean;
    onLayout?: (y: number, height: number) => void;
    showReconnect?: boolean;
    onReconnect?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
    title,
    onSettingsPress,
    onSearch,
    onSearchFocus,
    onSearchBlur,
    isSearchFocused,
    currentDomain,
    onFilterByDomain,
    domainCounts,
    hideSearchAndDomain,
    onLayout,
    showReconnect,
    onReconnect,
}) => {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    // Replace the hardcoded paddingTop: 60 (which was a magic number for the
    // iOS status bar) with the actual top safe-area inset. On web/desktop
    // insets.top is 0, so the bar is no longer awkwardly tall there.
    const headerPaddingTop = Math.max(insets.top, 12);
    return (
        <View onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.y, e.nativeEvent.layout.height) : undefined}>
            {/* Top Bar */}
            <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
                <TouchableOpacity onPress={onSettingsPress} style={styles.iconButton}>
                    <Ionicons name="settings-outline" size={24} color="#1A1A1A" />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>{title}</Text>
                    {showReconnect && (
                        <TouchableOpacity onPress={onReconnect} style={styles.reconnectBadge}>
                            <Ionicons name="refresh-circle-outline" size={16} color="#FFFFFF" />
                            <Text style={styles.reconnectText}>{t('reconnect')}</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.iconPlaceholder} />
            </View>

            {/* Search Bar & Domain Filter */}
            {!hideSearchAndDomain && (
                <View style={styles.searchContainer}>
                    <SearchBar
                        onSearch={onSearch}
                        onFocus={onSearchFocus}
                        onBlur={onSearchBlur}
                        placeholder={t('search_placeholder')}
                    />
                    {!isSearchFocused && (
                        <DomainSelector
                            selectedDomain={currentDomain}
                            onSelectDomain={onFilterByDomain}
                            domainCounts={domainCounts}
                            mode="filter"
                        />
                    )}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        // paddingTop is now applied inline from useSafeAreaInsets so the bar
        // is the right height on iOS (status bar + notch), Android, and web.
        paddingBottom: 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1A1A1A',
        ...RTL_TEXT_STYLE,
    },
    iconButton: {
        padding: 8,
    },
    iconPlaceholder: {
        width: 40,
    },
    searchContainer: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 8,
        backgroundColor: '#F0F2F5',
        zIndex: 10,
        // Cap the readable width on wide screens (web / large tablets) so
        // the search and domain filter don't stretch edge-to-edge.
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
    },
    headerCenter: {
        flexDirection: 'column',
        alignItems: 'center',
    },
    reconnectBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FF9800',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
        marginTop: 4,
    },
    reconnectText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 4,
    },
});
