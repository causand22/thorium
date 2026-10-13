import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Row } from 'react-bootstrap';
import AlertBanner from '@components/shared/alerts/AlertBanner';

// project imports
import { orderComparePipelineName } from './pipelines';
import { buildReactionsList, SelectedPipelines } from './reactions';
import Title from '@components/shared/titles/Title';
import Markdown from '@components/shared/syntax/Markdown';
import { OverlayTipTop } from '@components/shared/overlay/tips';
import { cleanDescription } from '@utilities/description';
import { listPipelinesDetails } from '@thorpi/pipelines';
import type { ReactionSelection } from '@models/reactions';
import type { UserInfo } from '@models/users';
import { useQueries } from '@tanstack/react-query';
import { queryKeys } from '@thorpi/queryKeys';

// spec: ../files.spec.md

interface SelectPipelinesProps {
  userInfo: UserInfo | null;
  setReactionsList: (list: ReactionSelection[]) => void;
  setError?: (errors: string[]) => void;
  currentSelections?: ReactionSelection[];
  sha256?: string;
}

const SelectPipelines = ({ userInfo, setReactionsList, setError, currentSelections }: SelectPipelinesProps) => {
  const [selectedPipelines, setSelectedPipelines] = useState<SelectedPipelines>({});

  const groups = userInfo?.groups ?? [];

  const pipelineQueries = useQueries({
    queries:
      groups.map((group) => ({
        queryKey: queryKeys.pipelines.details(group),
        queryFn: () => listPipelinesDetails(group),
        enabled: !!group,
      })) ?? [],
  });

  const pipelineDataKey = pipelineQueries.map((query) => query.dataUpdatedAt).join('|');

  const pipelines = useMemo(
    () => Object.fromEntries(pipelineQueries.map((query, idx) => [groups[idx], query.data ?? []])),
    [pipelineDataKey, groups],
  );

  useEffect(() => {
    const selectablePipelines: SelectedPipelines = {};

    Object.values(pipelines).forEach((groupPipelines) => {
      groupPipelines.forEach((pipeline) => {
        selectablePipelines[pipeline.group] ??= {};
        selectablePipelines[pipeline.group][pipeline.name] = false;
      });
    });

    currentSelections?.forEach((selection) => {
      selectablePipelines[selection.group] ??= {};
      selectablePipelines[selection.group][selection.pipeline] = true;
    });

    setSelectedPipelines(selectablePipelines);
  }, [pipelines, currentSelections]);

  // handle pipeline button click
  const handlePipelineClick = (group: string, pipelineName: string) => {
    const selected = structuredClone(selectedPipelines);
    selected[group][pipelineName] = !selectedPipelines[group][pipelineName];
    setSelectedPipelines(selected);
    setReactionsList(buildReactionsList(selected));
    if (setError) setError([]);
  };

  return (
    <Card className="panel">
      <Card.Body className="py-0">
        <center>
          {pipelineQueries.map((query, idx) =>
            query.error ? (
              <AlertBanner key={groups[idx]}>
                Failed to list pipelines for {userInfo!.groups[idx]}: {query.error.message}
              </AlertBanner>
            ) : null,
          )}
          {pipelines &&
            userInfo &&
            userInfo['groups'] &&
            userInfo.groups.map((group) => {
              if (pipelines[group] && pipelines[group].length) {
                return (
                  <div key={group}>
                    <Row className="mt-4 mb-2">
                      <Col>
                        <Title small>{group}</Title>
                      </Col>
                    </Row>
                    <Row className="mb-4">
                      <Col>
                        {pipelines[group]
                          .sort((a, b) => orderComparePipelineName(a, b))
                          .map((pipeline) => {
                            const description = cleanDescription(pipeline.description);
                            return description ? (
                              <OverlayTipTop
                                key={`${pipeline.group}_${pipeline.name}`}
                                wide
                                tip={(<Markdown>{description}</Markdown>) as unknown as string}
                              >
                                <Button
                                  variant=""
                                  className={`m-1 primary-btn ${selectedPipelines[`${pipeline.group}`]?.[`${pipeline.name}`] ? 'selected' : 'unselected'}`}
                                  onClick={() => handlePipelineClick(pipeline.group, pipeline.name)}
                                >
                                  <b>{pipeline.name}</b>
                                </Button>
                              </OverlayTipTop>
                            ) : (
                              <Button
                                variant=""
                                key={`${pipeline.group}_${pipeline.name}`}
                                className={`m-1 primary-btn ${selectedPipelines[`${pipeline.group}`]?.[`${pipeline.name}`] ? 'selected' : 'unselected'}`}
                                onClick={() => handlePipelineClick(pipeline.group, pipeline.name)}
                              >
                                <b>{pipeline.name}</b>
                              </Button>
                            );
                          })}
                      </Col>
                    </Row>
                  </div>
                );
              } else {
                return null;
              }
            })}
        </center>
      </Card.Body>
    </Card>
  );
};

export default SelectPipelines;
