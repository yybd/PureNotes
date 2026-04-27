// NoteCard.tsx - Expandable inline note card
// Tap to expand/view, Long press to edit, auto-save on blur

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    LayoutAnimation,
    Platform,
    UIManager,
    Keyboard,
    ScrollView,
    StyleProp,
    ViewStyle,
    Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Note, DOMAINS, DomainType } from '../types/Note';
import { useNotesStore } from '../stores/notesStore';
import FrontmatterService, { getContentWithoutFrontmatter, updateFrontmatter, removeFrontmatterKey } from '../services/FrontmatterService';
import { DomainSelector } from './DomainSelector';
import { UnifiedMarkdownDisplay } from './UnifiedMarkdownDisplay';
import { SmartEditor, SmartEditorRef } from './SmartEditor';
import { getDirection, RTL_TEXT_STYLE } from '../utils/rtlUtils';
import { handleListContinuation, toggleCheckboxByIndex, appendChecklistItem } from '../utils/markdownUtils';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Short, snappy layout animation. The built-in `easeInEaseOut` preset runs
// at 500ms which feels sluggish for tap-to-expand and edit-state toggles.
// Cutting to ~200ms keeps the visual feedback while feeling instant.
const SHORT_LAYOUT_ANIMATION = {
    duration: 200,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
} as const;

interface NoteCardProps {
    note: Note;
    onPress?: () => void;
    onUpdate: (content: string) => void;
    onDismissKeyboard?: () => void;
    onSync?: () => void;
    onArchive?: () => void;
    onEditStart?: (instance: SmartEditorRef | null, content: string, selection: { start: number; end: number }) => void;
    onEditEnd?: () => void;
    onEditContentChange?: (content: string) => void;
    onEditSelectionChange?: (selection: { start: number; end: number }) => void;
    onStatusChange?: (actions: string[]) => void;
    externalEditContent?: string; // Content controlled by parent (for toolbar updates)
    externalIsPinned?: boolean; // Pinned state controlled by parent
    maxEditHeight?: number; // Dynamic max height for editor, calculated by parent (unused in richtext mode)
    /** Extra horizontal space (left+right) consumed by ancestors. Used for WebView width calculation. */
    editorHorizontalInset?: number;
    autoEdit?: boolean; // Start in edit mode immediately
    forceExitEdit?: boolean; // Force exit edit mode (when another card starts editing)
    onEditRequest?: () => void; // Request external editing instead of inline
    onQuickAddRequest?: () => void; // Request external editing + append checklist item
    onEditorReady?: () => void; // Fired when the rich text editor WebView is initialized
    style?: StyleProp<ViewStyle>;
}

// Strip markdown syntax for clean preview
const stripMarkdown = (text: string): string => {
    return text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/~~(.+?)~~/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^# /gm, '')
        .replace(/^## /gm, '')
        .replace(/^### /gm, '')
        .replace(/^> /gm, '')
        .replace(/^- \[x\] /gm, '✓ ')
        .replace(/^- \[ \] /gm, '○ ')
        .replace(/^- /gm, '• ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
};

const NoteCardImpl: React.FC<NoteCardProps> = ({ note, onPress, onUpdate, onDismissKeyboard, onSync, onArchive, onEditStart, onEditEnd, onEditContentChange, onEditSelectionChange, onStatusChange, externalEditContent, externalIsPinned, maxEditHeight, editorHorizontalInset = 64, autoEdit, forceExitEdit, onEditRequest, onQuickAddRequest, onEditorReady, style }) => {
    const { t, i18n } = useTranslation();
    // Parse content upfront for autoEdit mode
    const initialParsed = autoEdit ? FrontmatterService.parseFrontmatter(note.content) : null;

    const [isExpanded, setIsExpanded] = useState(!!autoEdit);
    const [isEditing, setIsEditing] = useState(!!autoEdit);
    const [editBody, setEditBodyState] = useState(initialParsed?.body || '');
    const lastProcessedTextRef = useRef(initialParsed?.body || '');
    const [editFrontmatter, setEditFrontmatter] = useState<Record<string, any>>(initialParsed?.frontmatter || {});
    const [editSelection, setEditSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
    const [showDomainSelector, setShowDomainSelector] = useState(false);
    const [isPinned, setIsPinned] = useState(!!note.pinned);

    // Custom setter for editBody to also update lastProcessedTextRef
    const setEditBody = (newBody: string) => {
        setEditBodyState(newBody);
        lastProcessedTextRef.current = newBody;
    };

    // We replace TextInput ref with SmartEditorRef
    const editorRef = useRef<SmartEditorRef>(null);

    // Stable ref callback - prevents inline arrow function from being recreated on every render,
    // which was causing onEditStart to fire on every re-render → infinite loop.
    const handleEditorRef = useCallback((ref: SmartEditorRef | null) => {
        editorRef.current = ref;
    }, []);

    // Ref flag: set to true when we just entered edit mode, cleared after focus is applied.
    // This prevents handlePress from exiting edit mode on the same gesture as the long-press,
    // and drives the onLayout-based focus mechanism (no arbitrary timeout needed).
    const pendingFocusRef = useRef(false);
    const editStartedRef = useRef(false);


    // Notify parent when editing starts (runs once when isEditing becomes true)
    // intentionally excludes onEditStart from deps to avoid calling it on every parent re-render
    useEffect(() => {
        if (isEditing && editorRef.current) {
            onEditStart?.(editorRef.current, editBody, editSelection);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditing]);

    // Prevent background sync from clobbering this note while it is being edited inline.
    // Releases automatically when edit mode ends or the card unmounts.
    useEffect(() => {
        if (!isEditing) return;
        const id = note.id;
        const lockNote = useNotesStore.getState().lockNote;
        const unlockNote = useNotesStore.getState().unlockNote;
        lockNote(id);
        return () => unlockNote(id);
    }, [isEditing, note.id]);



    // Sync pinned state and keep editFrontmatter synced with external pin toggles (e.g search updates)
    useEffect(() => {
        setIsPinned(!!note.pinned);
        setEditFrontmatter(prev => ({ ...prev, pinned: note.pinned, domain: note.domain }));
    }, [note.pinned, note.domain]);

    // Sync external pinned state from parent toolbar
    useEffect(() => {
        if (isEditing && externalIsPinned !== undefined && externalIsPinned !== isPinned) {
            setIsPinned(externalIsPinned);
            setEditFrontmatter(prev => {
                const newFm = { ...prev };
                if (externalIsPinned) {
                    newFm.pinned = true;
                } else {
                    delete newFm.pinned;
                }
                return newFm;
            });
        }
    }, [externalIsPinned]);

    // Sync external content changes from parent toolbar
    useEffect(() => {
        if (isEditing && externalEditContent !== undefined && externalEditContent !== editBody) {
            setEditBody(externalEditContent);
            lastProcessedTextRef.current = externalEditContent;
        }
    }, [externalEditContent]);

    // Get content without frontmatter for display
    const displayContent = getContentWithoutFrontmatter(note.content);

    // Extract title (first line) and body (rest)
    const lines = displayContent.split('\n');
    const firstLine = lines[0] || '';
    const restLines = lines.slice(1).join('\n');

    // Remove # from title for display
    const title = firstLine.replace(/^#+\s*/, '').trim();
    const hasTitle = firstLine.startsWith('#');

    // Body content (without first line if it's a title)
    const bodyContent = hasTitle ? restLines : displayContent;
    const cleanBody = stripMarkdown(bodyContent);
    const preview = cleanBody.substring(0, 120);
    const hasMore = cleanBody.length > 120;

    const syncStatusColor = {
        synced: '#4CAF50',
        pending: '#FF9800',
        error: '#F44336',
    }[note.syncStatus];

    // Format timestamp
    const formatTimestamp = (date: Date) => {
        const locale = i18n.language === 'he' ? 'he-IL' : 'en-US';
        return date.toLocaleDateString(locale, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Handle tap - expand/collapse view
    const handlePress = () => {
        // Guard: if we JUST entered edit mode via long-press, ignore this tap.
        // On some devices/RN versions, onPress fires after onLongPress on finger lift.
        if (editStartedRef.current) {
            editStartedRef.current = false;
            return;
        }

        if (isEditing) {
            // Do not close the editor when tapping inside the card
            // This allows the user to tap the text freely to move the cursor
            return;
        }

        LayoutAnimation.configureNext(SHORT_LAYOUT_ANIMATION);
        setIsExpanded(!isExpanded);
    };

    // Handle long press - enter edit mode
    const handleLongPress = () => {
        if (onEditRequest) {
            onEditRequest();
            return;
        }

        LayoutAnimation.configureNext(SHORT_LAYOUT_ANIMATION);

        editStartedRef.current = true;   // Guard against handlePress firing after
        pendingFocusRef.current = true;  // Will be consumed by onLayout

        setIsExpanded(true);
        setIsEditing(true);
        setShowDomainSelector(false); // Reset selector visibility

        const parsed = FrontmatterService.parseFrontmatter(note.content);
        setEditBody(parsed.body);
        setEditFrontmatter(parsed.frontmatter);

        const initialSelection = { start: 0, end: 0 };
        setEditSelection(initialSelection);
    };

    // Handle blur - save and exit
    const handleBlur = () => {
        const fullContent = FrontmatterService.composeContent(editFrontmatter, editBody);
        if (isEditing && fullContent !== note.content) {
            onUpdate(fullContent);
        }
        LayoutAnimation.configureNext(SHORT_LAYOUT_ANIMATION);
        setIsEditing(false);
        setIsExpanded(false);
        onEditEnd?.(); // Notify end of editing
    };

    const handleDone = () => {
        Keyboard.dismiss();

        // Ensure the absolute latest pin state is applied to the frontmatter
        // before composing the content, avoiding any useEffect async timing issues
        const finalFrontmatter = { ...editFrontmatter };
        if (isPinned) {
            finalFrontmatter.pinned = true;
        } else {
            delete finalFrontmatter.pinned;
        }

        const fullContent = FrontmatterService.composeContent(finalFrontmatter, editBody);

        // Always update if the pin state changed from original, even if strings somehow match
        if (isEditing && (fullContent !== note.content || isPinned !== !!note.pinned)) {
            onUpdate(fullContent);
        }

        LayoutAnimation.configureNext(SHORT_LAYOUT_ANIMATION);
        setIsEditing(false);
        setIsExpanded(false);
        onEditEnd?.(); // Notify end of editing
        // Return focus to quick note input
        onDismissKeyboard?.();
    };

    const hasChecklist = /\[[ x]\]/i.test(note.content);


    // Force exit edit mode when another card starts editing
    useEffect(() => {
        if (forceExitEdit && isEditing) {
            // Save content if changed, but don't call onEditEnd (parent already knows)
            const fullContent = FrontmatterService.composeContent(editFrontmatter, editBody);
            if (fullContent !== note.content) {
                onUpdate(fullContent);
            }
            setIsEditing(false);
            setIsExpanded(false);
        }
    }, [forceExitEdit]);

    // Auto-edit mode: trigger edit on mount
    useEffect(() => {
        if (autoEdit) {
            pendingFocusRef.current = true;
            const parsed = FrontmatterService.parseFrontmatter(note.content);
            setEditBody(parsed.body);
            lastProcessedTextRef.current = parsed.body;
            setEditFrontmatter(parsed.frontmatter);
            const initialSelection = { start: 0, end: 0 };
            setEditSelection(initialSelection);
        }
    }, [autoEdit, note.content]);

    // Notify parent of editor readiness - NO-OP now replaced by ref callback

    const handleQuickAdd = () => {
        // If external floating editor is used, delegate to parent
        if (onQuickAddRequest) {
            onQuickAddRequest();
            return;
        }

        LayoutAnimation.configureNext(SHORT_LAYOUT_ANIMATION);

        // Parse the note and immediately append a new checklist item
        const parsed = FrontmatterService.parseFrontmatter(note.content);
        const newBody = appendChecklistItem(parsed.body);
        const newSelection = { start: newBody.length, end: newBody.length };

        // Enter edit mode with the already-updated body
        pendingFocusRef.current = true;

        setIsExpanded(true);
        setIsEditing(true);
        setEditBody(newBody);
        lastProcessedTextRef.current = newBody;
        setEditFrontmatter(parsed.frontmatter);
        setEditSelection(newSelection);
        onEditContentChange?.(newBody);

        // For richtext mode: initialContentHTML is set once at WebView creation,
        // so we must also push the updated content via setTextAndSelection after
        // the editor is mounted. A short delay allows the WebView to initialize.
        setTimeout(() => {
            editorRef.current?.setTextAndSelection?.(newBody, newSelection);
        }, 300);
    };

    const handleDeleteCompleted = () => {
        Alert.alert(
            t('delete_completed_title'),
            t('delete_completed_confirm'),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('delete_action'),
                    style: 'destructive',
                    onPress: () => {
                        const lines = note.content.split('\n');
                        // Regex matches task items that are checked: [x] or [X]
                        const checkedRegex = /^\s*([-\*+]|\d+\.)\s*\[[xX]\]/;

                        const filteredLines = lines.filter(line => !checkedRegex.test(line));

                        if (filteredLines.length !== lines.length) {
                            LayoutAnimation.configureNext(SHORT_LAYOUT_ANIMATION);
                            onUpdate(filteredLines.join('\n'));
                        }
                    }
                }
            ]
        );
    };

    const handleTextChangeWithListContinuation = (newText: string) => {
        const result = handleListContinuation(newText, lastProcessedTextRef.current);

        if (result) {
            lastProcessedTextRef.current = result.modifiedText;
            setEditBody(result.modifiedText);
            onEditContentChange?.(result.modifiedText);

            if (result.cursorShouldMove) {
                const newSelection = { start: result.newCursorPos, end: result.newCursorPos };
                setEditSelection(newSelection);
                onEditSelectionChange?.(newSelection);
                editorRef.current?.setTextAndSelection?.(result.modifiedText, newSelection);
            } else {
                editorRef.current?.setText?.(result.modifiedText);
            }
        } else {
            lastProcessedTextRef.current = newText;
            setEditBody(newText);
            onEditContentChange?.(newText);
        }
    };

    return (
        <View
            style={[
                styles.cardShadow,
                isExpanded && styles.cardExpandedShadow,
                style
            ]}
        >
        <TouchableOpacity
            style={[
                styles.cardClip,
                isEditing && styles.cardEditing
            ]}
            onPress={handlePress}
            onLongPress={handleLongPress}
            activeOpacity={0.9}
            delayLongPress={250}
        >
            <View style={styles.cardInner}>
                {/* Timestamp, sync status, Done button, and Pin indicator */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        {/* Domain Chip - Clickable in Edit Mode */}
                        {(isEditing || note.domain) && (
                            <TouchableOpacity
                                onPress={() => isEditing && setShowDomainSelector(!showDomainSelector)}
                                disabled={!isEditing}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                style={[
                                    styles.domainChip,
                                    note.domain && DOMAINS[note.domain] ? {
                                        backgroundColor: DOMAINS[note.domain].color + '20',
                                        borderColor: DOMAINS[note.domain].color
                                    } : (isEditing ? styles.domainEditButton : {})
                                ]}
                            >
                                <Text style={[
                                    styles.domainText,
                                    note.domain && DOMAINS[note.domain] ? { color: DOMAINS[note.domain].color } : styles.domainEditPlaceholder
                                ]}>
                                    {note.domain ? t(`domain_${note.domain}`) : t('add_domain')}
                                </Text>
                            </TouchableOpacity>
                        )}
                        {/* Pin Icon - Toggle in Edit Mode */}
                        {(isEditing || isPinned) && (
                            <TouchableOpacity
                                onPress={() => {
                                    if (isEditing) {
                                        const newPinned = !isPinned;
                                        setIsPinned(newPinned);
    
                                        const newFrontmatter = { ...editFrontmatter, pinned: newPinned };
                                        setEditFrontmatter(newFrontmatter);
    
                                        const fullContent = FrontmatterService.composeContent(newFrontmatter, editBody);
    
                                        // Force immediate save for metadata changes
                                        onUpdate(fullContent);
                                    }
                                }}
                                disabled={!isEditing}
                            >
                                <MaterialCommunityIcons
                                    name={isPinned ? "pin" : "pin-outline"}
                                    size={20}
                                    color={isPinned ? "#000000" : (isEditing ? "#000000" : "transparent")}
                                    style={styles.pinIcon}
                                />
                            </TouchableOpacity>
                        )}
                        <Text style={styles.timestamp}>
                            {formatTimestamp(note.updatedAt)}
                        </Text>
    
                        {/* On web there are no inline buttons — archive is the
                            swipe gesture, and edit is triggered by right-click
                            (handled on the outer TouchableOpacity below). */}
                    </View>
    
    
                    <View style={styles.headerRight}>
                        {isEditing && (
                            <TouchableOpacity onPress={handleDone} style={styles.doneButton} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                                <Ionicons name="checkmark-circle" size={32} color="#000000" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
    
                {/* Domain Selector - Full width below header */}
                {isEditing && showDomainSelector && (
                    <DomainSelector
                        selectedDomain={note.domain as DomainType}
                        onSelectDomain={(domain) => {
                            const newFrontmatter = { ...editFrontmatter };
                            if (domain) {
                                newFrontmatter['domain'] = domain;
                            } else {
                                delete newFrontmatter['domain'];
                            }
                            setEditFrontmatter(newFrontmatter);
                            setShowDomainSelector(false);
    
                            const fullContent = FrontmatterService.composeContent(newFrontmatter, editBody);
                            onUpdate(fullContent);
                        }}
                        mode="select"
                        style={{ marginBottom: 12 }}
                    />
                )}
    
                {/* Content - view or edit mode */}
                {isEditing ? (
                    <View
                        style={maxEditHeight ? { maxHeight: maxEditHeight } : undefined}
                        onLayout={() => {
                            // Event-driven focus: fires when the editor container
                            // is actually laid out — works regardless of device speed.
                            if (pendingFocusRef.current) {
                                pendingFocusRef.current = false;
                                editorRef.current?.focus();
                            }
                        }}
                    >
                        <SmartEditor
                            ref={handleEditorRef}
                            initialContent={editBody}
                            selection={editSelection}
                            onChange={handleTextChangeWithListContinuation}
                            onSelectionChange={(e: any) => {
                                const newSelection = e.nativeEvent.selection;
                                setEditSelection(newSelection);
                                onEditSelectionChange?.(newSelection);
                            }}
                            onStatusChange={onStatusChange}
                            onEditorReady={onEditorReady}
                            autoFocus={autoEdit}
                            contentInset={{ bottom: 0 }}
                            scrollIndicatorInsets={{ bottom: 0 }}
                        />
                    </View>
                ) : (
                    <View style={!isExpanded ? { maxHeight: 100, overflow: 'hidden' } : undefined}>
                        {/* Title */}
                        {hasTitle && title && (
                            <Text style={[styles.title, { textAlign: getDirection(title) === 'rtl' ? 'right' : 'left' }]} numberOfLines={isExpanded ? undefined : 2}>
                                {title}
                            </Text>
                        )}
                        {/* Body preview */}
                        <View style={!isExpanded ? { maxHeight: 120, overflow: 'hidden' } : undefined}>
                            <UnifiedMarkdownDisplay
                                content={bodyContent}
                                onToggleCheckbox={isExpanded && !isEditing ? (index) => {
                                    const newContent = toggleCheckboxByIndex(note.content, index);
                                    if (newContent !== note.content) {
                                        onUpdate(newContent);
                                    }
                                } : undefined}
                            />
                        </View>
                        {!isExpanded && hasMore && (
                            <View style={styles.gradientOverlay} />
                        )}
                    </View>
                )}
    
                {/* Quick Add Checklist Item Button - Inline at the bottom of display mode */}
                {isExpanded && !isEditing && hasChecklist && (
                    <View style={styles.quickAddRow}>
                        <TouchableOpacity
                            onPress={handleQuickAdd}
                            style={styles.quickAddButtonInline}
                        >
                            <Ionicons name="add-circle" size={32} color="#000000" />
                        </TouchableOpacity>
    
                        <TouchableOpacity
                            onPress={handleDeleteCompleted}
                            style={[styles.quickAddButtonInline, { marginLeft: 24 }]}
                        >
                            <MaterialCommunityIcons name="broom" size={28} color="#000000" />
                        </TouchableOpacity>
                    </View>
                )}
    
                {/* Tags */}
                {note.tags && note.tags.length > 0 && !isEditing && (
                    <View style={styles.tagsContainer}>
                        {note.tags.slice(0, 3).map((tag) => (
                            <View key={tag} style={styles.tag}>
                                <Text style={styles.tagText}>#{tag}</Text>
                            </View>
                        ))}
                        {note.tags.length > 3 && (
                            <Text style={styles.moreText}>+{note.tags.length - 3}</Text>
                        )}
                    </View>
                )}
    
                {/* Expand indicator */}
                {!isExpanded && hasMore && !isEditing && (
                    <View style={styles.expandHint}>
                        <Ionicons name="chevron-down" size={16} color="#999" />
                    </View>
                )}
            </View>
        </TouchableOpacity>
        </View>
    );
};

// Custom comparator: re-render only when the note data or value-type props
// actually change. Callback props (onUpdate, onArchive, etc.) are recreated
// by the parent on every render — comparing by identity would defeat memo
// and re-render every card on every keystroke / search input / modal toggle.
// Style is also intentionally skipped as it is typically an inline object.
const arePropsEqual = (prev: NoteCardProps, next: NoteCardProps): boolean => {
    if (prev.note !== next.note) return false;
    if (prev.externalEditContent !== next.externalEditContent) return false;
    if (prev.externalIsPinned !== next.externalIsPinned) return false;
    if (prev.maxEditHeight !== next.maxEditHeight) return false;
    if (prev.editorHorizontalInset !== next.editorHorizontalInset) return false;
    if (prev.autoEdit !== next.autoEdit) return false;
    if (prev.forceExitEdit !== next.forceExitEdit) return false;
    return true;
};

export const NoteCard = React.memo(NoteCardImpl, arePropsEqual);

const styles = StyleSheet.create({
    cardShadow: {
        marginBottom: 12,
        borderRadius: 16,
        backgroundColor: '#FFFFFF', // Required for shadow/elevation on Android
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 4,
    },
    cardExpandedShadow: {
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 6,
    },
    cardClip: {
        // Pass-through layer for the TouchableOpacity — visual rounding/clipping
        // lives on cardShadow above. Avoids stacking multiple rounded edges,
        // which produces a thin gray anti-alias ring at the corners on iOS.
    },
    cardInner: {
        padding: 16,
    },
    cardEditing: {
        borderWidth: 2,
        borderColor: '#000000',
        borderRadius: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    domainChip: {
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 12,
        marginRight: 8,
        borderWidth: 1,
    },
    domainText: {
        fontSize: 12,
        fontWeight: '600',
    },
    pinIcon: {
        marginRight: 4,
    },
    doneButton: {
        marginRight: 12,
        padding: 4,
    },
    editIcon: {
        marginRight: 8,
    },
    timestamp: {
        fontSize: 13,
        color: '#888888',
        ...RTL_TEXT_STYLE,
    },
    syncIndicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    domainEditButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 12,
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        backgroundColor: '#F5F5F5',
    },
    domainEditPlaceholder: {
        fontSize: 12,
        color: '#666',
        fontWeight: '600',
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1A1A1A',
        // textAlign/writingDirection removed here to be dynamic in render
        marginBottom: 6,
    },
    preview: {
        fontSize: 15,
        color: '#333333',
        lineHeight: 22,
        // textAlign/writingDirection removed
    },
    editInput: {
        fontSize: 15,
        color: '#333333',
        lineHeight: 22,
        ...RTL_TEXT_STYLE,
        minHeight: 60,
        padding: 0,
    },
    tagsContainer: {
        flexDirection: 'row-reverse',
        flexWrap: 'wrap',
        marginTop: 10,
    },
    tag: {
        backgroundColor: '#E3F2FD',
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 12,
        marginLeft: 6,
        marginBottom: 4,
    },
    tagText: {
        fontSize: 12,
        color: '#1976D2',
        fontWeight: '500',
    },
    moreText: {
        fontSize: 12,
        color: '#999',
        alignSelf: 'center',
    },
    expandHint: {
        alignItems: 'center',
        marginTop: 8,
    },
    gradientOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 40,
        backgroundColor: 'rgba(255,255,255,0.85)',
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
    },
    quickAddRow: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        marginTop: 12,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#F0F0F0',
    },
    quickAddButtonInline: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
    },
    quickAddText: {
        marginLeft: 8,
        color: '#000000',
        fontWeight: '600',
        fontSize: 16,
    },
});

