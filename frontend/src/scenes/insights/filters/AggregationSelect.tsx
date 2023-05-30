import { useActions, useValues } from 'kea'
import { groupsModel } from '~/models/groupsModel'
import { LemonSelect, LemonSelectSection } from '@posthog/lemon-ui'
import { groupsAccessLogic } from 'lib/introductions/groupsAccessLogic'
import { GroupIntroductionFooter } from 'scenes/groups/GroupsIntroduction'
import { funnelLogic } from 'scenes/funnels/funnelLogic'
import { InsightLogicProps } from '~/types'
import { insightLogic } from '../insightLogic'
import { isFunnelsQuery, isInsightQueryNode } from '~/queries/utils'
import { insightVizDataLogic } from 'scenes/insights/insightVizDataLogic'
import { FunnelsQuery } from '~/queries/schema'
import { isFunnelsFilter } from 'scenes/insights/sharedUtils'
import { HogQLEditor } from 'lib/components/HogQLEditor/HogQLEditor'

type AggregationSelectProps = {
    insightProps: InsightLogicProps
    className?: string
    hogqlAvailable?: boolean
    value?: string
}

function getHogQLValue(groupIndex?: number, aggregationQuery?: string): string {
    if (groupIndex !== undefined) {
        return `$group_${groupIndex}`
    } else if (aggregationQuery) {
        return aggregationQuery
    } else {
        return UNIQUE_USERS
    }
}

function hogQLToFilterValue(value?: string): { groupIndex?: number; aggregationQuery?: string } {
    if (value?.match(/^\$group_[0-9]+$/)) {
        return { groupIndex: parseInt(value.replace('$group_', '')) }
    } else if (value === 'person_id') {
        return {}
    } else {
        return { aggregationQuery: value }
    }
}

export function AggregationSelectDataExploration({
    insightProps,
    className,
    hogqlAvailable,
}: AggregationSelectProps): JSX.Element | null {
    const { querySource } = useValues(insightVizDataLogic(insightProps))
    const { updateQuerySource } = useActions(insightVizDataLogic(insightProps))

    if (!isInsightQueryNode(querySource)) {
        return null
    }

    const value = getHogQLValue(
        querySource.aggregation_group_type_index,
        isFunnelsQuery(querySource) ? querySource.funnelsFilter?.funnel_aggregate_by_hogql : undefined
    )

    return (
        <AggregationSelectComponent
            className={className}
            hogqlAvailable={hogqlAvailable}
            value={value}
            onChange={(value) => {
                const { aggregationQuery, groupIndex } = hogQLToFilterValue(value)
                if (isFunnelsQuery(querySource)) {
                    updateQuerySource({
                        aggregation_group_type_index: groupIndex,
                        funnelsFilter: { ...querySource.funnelsFilter, funnel_aggregate_by_hogql: aggregationQuery },
                    } as FunnelsQuery)
                } else {
                    updateQuerySource({ aggregation_group_type_index: groupIndex } as FunnelsQuery)
                }
            }}
        />
    )
}

export function AggregationSelect({ insightProps, className, hogqlAvailable }: AggregationSelectProps): JSX.Element {
    const { filters } = useValues(insightLogic(insightProps))
    const { setFilters } = useActions(funnelLogic(insightProps))

    const value = getHogQLValue(
        filters.aggregation_group_type_index,
        isFunnelsFilter(filters) ? filters.funnel_aggregate_by_hogql : undefined
    )

    return (
        <AggregationSelectComponent
            className={className}
            value={value}
            hogqlAvailable={hogqlAvailable}
            onChange={(value) => {
                const { aggregationQuery, groupIndex } = hogQLToFilterValue(value)
                if (isFunnelsFilter(filters)) {
                    setFilters({
                        ...filters,
                        aggregation_group_type_index: groupIndex,
                        funnel_aggregate_by_hogql: aggregationQuery,
                    })
                } else {
                    setFilters({
                        ...filters,
                        aggregation_group_type_index: groupIndex,
                    })
                }
            }}
        />
    )
}

const UNIQUE_USERS = 'person_id'
interface AggregationSelectComponentProps {
    className?: string
    hogqlAvailable?: boolean
    value?: string
    onChange: (value: string | undefined) => void
}

function AggregationSelectComponent({
    className,
    hogqlAvailable,
    onChange,
    value,
}: AggregationSelectComponentProps): JSX.Element {
    const { groupTypes, aggregationLabel } = useValues(groupsModel)
    const { needsUpgradeForGroups, canStartUsingGroups } = useValues(groupsAccessLogic)

    const baseValues = [UNIQUE_USERS]
    const optionSections: LemonSelectSection<string>[] = [
        {
            title: 'Event Aggregation',
            options: [
                {
                    value: UNIQUE_USERS,
                    label: 'Unique users',
                },
            ],
        },
    ]

    if (needsUpgradeForGroups || canStartUsingGroups) {
        optionSections[0].footer = <GroupIntroductionFooter needsUpgrade={needsUpgradeForGroups} />
    } else {
        groupTypes.forEach((groupType) => {
            baseValues.push(`$group_${groupType.group_type_index}`)
            optionSections[0].options.push({
                value: `$group_${groupType.group_type_index}`,
                label: `Unique ${aggregationLabel(groupType.group_type_index).plural}`,
            })
        })
    }

    if (hogqlAvailable) {
        baseValues.push(`properties.$session_id`)
        optionSections[0].options.push({
            value: 'properties.$session_id',
            label: `Unique sessions`,
        })
    }
    optionSections[0].options.push({
        label: 'Custom HogQL expression',
        options: [
            {
                // This is a bit of a hack so that the HogQL option is only highlighted as active when the user has
                // set a custom value (because actually _all_ the options are HogQL)
                value: !value || baseValues.includes(value) ? '' : value,
                label: <span className="font-mono">{value}</span>,
                labelInMenu: function CustomHogQLOptionWrapped({ onSelect }) {
                    return (
                        <div className="w-120" style={{ maxWidth: 'max(60vw, 20rem)' }}>
                            <HogQLEditor
                                onChange={onSelect}
                                value={value}
                                disablePersonProperties
                                placeholder={
                                    "Enter HogQL expression, such as:\n- distinct_id\n- properties.$session_id\n- concat(distinct_id, ' ', properties.$session_id)\n- if(1 < 2, 'one', 'two')"
                                }
                            />
                        </div>
                    )
                },
            },
        ],
    })

    return (
        <LemonSelect
            className={className}
            value={value}
            onChange={(newValue) => {
                if (newValue !== null) {
                    onChange(newValue)
                }
            }}
            data-attr="retention-aggregation-selector"
            dropdownMatchSelectWidth={false}
            options={optionSections}
        />
    )
}
