import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FC } from 'react';
import { useNavigate } from 'react-router-dom';

// project imports
import ImageAccordionItem from '@components/pages/images/ImageAccordionItem';
import Page from '@components/pages/Page';
import { OmnibarImages } from '@components/shared/inputs/omnibar/Bars';
import type { Clause } from '@components/shared/inputs/omnibar/ClauseTypes';
import { defaultTimeSelection } from '@components/shared/inputs/omnibar/timepicker/utils';
import { useOmnibarUrlState } from '@components/shared/inputs/omnibar/useOmnibarUrlState';
import { getGroupsFromClauses, getSearchTextFromClauses, matchesStringClauses } from '@components/shared/inputs/omnibar/utils';
import NoResultsBanner from '@components/shared/alerts/NoResultsBanner';
import Title from '@components/shared/titles/Title';
import LoadingSpinner from '@components/shared/fallback/LoadingSpinner';
import { OverlayTipRight, OverlayTipBottom } from '@components/shared/overlay/tips';
import { useAuth } from '@utilities/auth';
import { getThoriumRole } from '@utilities/role';
import type { Image } from '@models/images';
import { RoleKey } from '@models/users';
import type { UserInfo } from '@models/users';
import { scrollToSection } from '@utilities/interactions';
import { Accordion } from '@components/shared/accordion';
import { CountBadge, HeaderBar, OmnibarRow } from '@pages/pipelines/PipelineBrowsing.styled';
import { Button } from '@components/shared/buttons';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { listImageDetails } from '@thorpi/images';
import { queryKeys } from '@thorpi/queryKeys';
import { listGroupDetails } from '@thorpi/groups';
import { groupListToRecord } from '@utilities/groups';

// spec: ./SPEC.md

/** Filter images client-side by the omnibar clauses (group, creator, name, free text). */
const filterImages = (images: Image[], clauses: Clause[]): Image[] => {
  const groups = getGroupsFromClauses(clauses);
  const text = getSearchTextFromClauses(clauses);

  return images.filter((image) => {
    const groupFilter = groups.length > 0 ? groups.includes(image.group) : true;
    const creatorFilter = matchesStringClauses(clauses, 'creator', image.creator);
    const nameFilter = matchesStringClauses(clauses, 'name', image.name);
    const textFilter = image.name.includes(text) || (image.description?.includes(text) ?? false);
    return groupFilter && creatorFilter && nameFilter && textFilter;
  });
};

interface CreateImageButtonProps {
  userInfo: UserInfo | null;
}

const CreateImageButton: FC<CreateImageButtonProps> = ({ userInfo }) => {
  const navigate = useNavigate();
  const userCanCreateImage = userInfo
    ? ([RoleKey.Developer, RoleKey.Analyst, RoleKey.Admin] as string[]).includes(getThoriumRole(userInfo.role))
    : false;
  const tip = userCanCreateImage
    ? `Create a new Image. You must be a
    Thorium developer, analyst, or admin to create an image.`
    : `You must be a Thorium developer or
    admin to create an image.`;

  return (
    <OverlayTipBottom tip={tip}>
      <Button className="ok-btn m-1" disabled={!userCanCreateImage} onClick={() => void navigate('/create/image')}>
        <b>+</b>
      </Button>
    </OverlayTipBottom>
  );
};

const ImageBrowsing: FC = () => {
  const { clauses, setClauses } = useOmnibarUrlState({ clauses: [], time: defaultTimeSelection() });
  const { userInfo } = useAuth();
  const [activeKeys, setActiveKeys] = useState<string[]>([]);

  const { data: groupDetails = [], isLoading: groupsLoading } = useQuery({
    queryKey: queryKeys.groups.details,
    queryFn: () => listGroupDetails(),
  });

  const groups = groupListToRecord(groupDetails);
  const groupNames = groupDetails.map((g) => g.name);

  const imageQueries = useQueries({
    queries: groupNames.map((group) => ({
      queryKey: queryKeys.images.details(group),
      queryFn: () => listImageDetails(group, null, 1000),
    })),
  });

  const images = useMemo(
    () => imageQueries.flatMap((query) => query.data ?? []).sort((a, b) => (a.group + a.name).localeCompare(b.group + b.name)),
    [imageQueries],
  );

  const loading = groupsLoading || imageQueries.some((query) => query.isLoading);

  const filteredImages = filterImages(images, clauses);

  const handleAccordionSelect = useCallback((eventKey: string | string[] | null | undefined) => {
    if (eventKey === null || eventKey === undefined) {
      setActiveKeys([]);
      return;
    }
    setActiveKeys(Array.isArray(eventKey) ? [...eventKey] : [eventKey]);
  }, []);

  const expandAccordionKey = useCallback((key: string) => {
    setActiveKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  useEffect(() => {
    if (!loading && images.length) {
      scrollOnLoad();
    }
  }, [loading, images.length]);

  const scrollOnLoad = () => {
    const hash = location.hash;
    if (hash.length <= 1) return;

    const scroll_id = hash.slice(1);
    if (scroll_id != '') {
      scrollToSection(scroll_id);
      handleAccordionSelect(scroll_id);
    }
  };

  // Full list reload (with the loading spinner) used after a delete removes an image.
  const reloadImages = useCallback(() => {
    void Promise.all(imageQueries.map((query) => query.refetch()));
  }, [imageQueries]);

  const queryClient = useQueryClient();

  const setImages = useCallback(
    (nextImages: Image[]) => {
      for (const group of groupNames) {
        queryClient.setQueryData(
          ['images', 'details', group],
          nextImages.filter((image) => image.group === group),
        );
      }
    },
    [queryClient, groupNames],
  );

  const imageCountTip =
    userInfo && getThoriumRole(userInfo.role) == RoleKey.Admin
      ? `There are a total of ${images.length} Thorium images.`
      : `There are a total of ${images.length} Thorium images owned by your groups.`;

  return (
    <Page title="Images · Thorium">
      <HeaderBar>
        <div>
          <h2>
            <OverlayTipRight tip={imageCountTip}>
              <CountBadge> {images.length} </CountBadge>
            </OverlayTipRight>
          </h2>
        </div>
        <Title>Images</Title>
        <div>
          <CreateImageButton userInfo={userInfo} />
        </div>
      </HeaderBar>
      <OmnibarRow>
        <OmnibarImages clauses={clauses} setClauses={setClauses} images={images} />
      </OmnibarRow>
      <LoadingSpinner loading={loading}></LoadingSpinner>
      {!loading && filteredImages.length === 0 && <NoResultsBanner type="Images" />}
      <Accordion alwaysOpen activeKey={activeKeys} onSelect={handleAccordionSelect}>
        {filteredImages.map((image) => (
          <ImageAccordionItem
            key={`${image.name}_${image.group}`}
            image={image}
            images={images}
            groups={groups}
            setImages={setImages}
            onRefresh={reloadImages}
            onExpand={expandAccordionKey}
          />
        ))}
      </Accordion>
    </Page>
  );
};

export default ImageBrowsing;
