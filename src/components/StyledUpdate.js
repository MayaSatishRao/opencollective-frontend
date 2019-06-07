import React, { Component } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import ReactTooltip from 'react-tooltip';
import { graphql, compose } from 'react-apollo';
import gql from 'graphql-tag';
import { Flex, Box } from '@rebass/grid';
import { Lock } from 'styled-icons/fa-solid';
import { get } from 'lodash';
import { FormattedMessage, defineMessages } from 'react-intl';

import Container from './Container';
import Avatar from './Avatar';
import withIntl from '../lib/withIntl';
import Role from './Role';
import Link from './Link';
import MessageBox from './MessageBox';
import EditUpdateForm from './EditUpdateForm';
import PublishUpdateBtnWithData from './PublishUpdateBtnWithData';
import UpdateTextWithData from './UpdateTextWithData';
import { H3 } from './Text';
import { formatDate } from '../lib/utils';
import { Router } from '../server/pages';

const UpdateWrapper = styled(Flex)`
  max-width: 80%;
  min-height: 100px;
  border: 1px solid #e6e8eb;
  padding: 20px;
  @media (max-width: 600px) {
    max-width: 100%;
  }
  ${({ compact }) =>
    !compact &&
    `
    border: none;
  `}
`;

const AvatarContainer = styled(Container)`
  margin-right: 20px;
`;

const ActionLink = styled(Link)`
  color: #71757a;
`;

class StyledUpdate extends Component {
  static propTypes = {
    collective: PropTypes.object.isRequired,
    update: PropTypes.object.isRequired,
    compact: PropTypes.bool, // if compact true, only show the summary
    editable: PropTypes.bool,
    includeHostedCollectives: PropTypes.bool,
    LoggedInUser: PropTypes.object,
  };

  constructor(props) {
    super(props);
    this.state = {
      modified: false,
      update: {},
      mode: props.compact ? 'summary' : 'details',
    };

    this.messages = defineMessages({
      pending: { id: 'update.pending', defaultMessage: 'pending' },
      paid: { id: 'update.paid', defaultMessage: 'paid' },
      approved: { id: 'update.approved', defaultMessage: 'approved' },
      rejected: { id: 'update.rejected', defaultMessage: 'rejected' },
      edit: { id: 'update.edit', defaultMessage: 'edit' },
      cancelEdit: { id: 'update.cancelEdit', defaultMessage: 'cancel edit' },
      viewLatestUpdates: {
        id: 'update.viewLatestUpdates',
        defaultMessage: 'View latest updates',
      },
    });
  }

  cancelEdit = () => {
    this.setState({ modified: false, mode: 'details' });
  };

  edit = () => {
    this.setState({ modified: false, mode: 'edit' });
  };

  toggleEdit = () => {
    this.state.mode === 'edit' ? this.cancelEdit() : this.edit();
  };

  deleteUpdate = async () => {
    if (!confirm('😱 Are you really sure you want to delete this update?')) return;

    try {
      await this.props.deleteUpdate(this.props.update.id);
      Router.pushRoute('collective', { slug: this.props.collective.slug });
    } catch (err) {
      console.error('>>> deleteUpdate error: ', JSON.stringify(err));
    }
  };

  save = async update => {
    update.id = get(this.props, 'update.id');
    console.log('>>> updating ', update);
    const res = await this.props.editUpdate(update);
    console.log('>>> save res', res);
    this.setState({ modified: false, mode: 'details' });
  };

  renderUpdateMeta(update, editable) {
    const { intl } = this.props;
    const { mode } = this.state;

    return (
      <Container display="flex" alignItems="Baseline" color="#969BA3" data-cy="meta">
        {update.isPrivate && (
          <Box mr={2}>
            <Lock data-tip data-for="privateLockText" data-cy="privateIcon" size={12} cursor="pointer" />
            <ReactTooltip id="privateLockText">
              <FormattedMessage id="update.private.lock_text" defaultMessage="This update is private" />
            </ReactTooltip>
          </Box>
        )}

        {update.publishedAt ? (
          <Box as="span" mr={1} fontSize="12px">
            <FormattedMessage
              id="update.publishedAtBy"
              defaultMessage={'Published on {date} by'}
              values={{
                date: formatDate(update.publishedAt, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }),
              }}
            />
          </Box>
        ) : (
          <Box as="span" mr={1} fontSize="12px">
            <FormattedMessage
              id="update.createdAt"
              defaultMessage={'created on {date} (draft)'}
              values={{ date: formatDate(update.createdAt) }}
            />
          </Box>
        )}
        <Box as="span" mr={2} fontSize="12px">
          {update.fromCollective.name}
        </Box>
        <Role role="ADMIN" />
        {editable && (
          <React.Fragment>
            <Box data-cy={'toggleEditUpdate'} mr={2} fontSize="12px">
              <ActionLink onClick={this.toggleEdit}>
                {intl.formatMessage(this.messages[`${mode === 'edit' ? 'cancelEdit' : 'edit'}`])}
              </ActionLink>
            </Box>
            <Box mr={2} fontSize="12px">
              <ActionLink onClick={this.deleteUpdate}>
                <FormattedMessage id="update.delete" defaultMessage="delete" />
              </ActionLink>
            </Box>
          </React.Fragment>
        )}
      </Container>
    );
  }

  renderUpdateTitle() {
    const { update, collective } = this.props;
    const { mode } = this.state;
    if (mode === 'summary') {
      return (
        <Link route={`/${collective.slug}/updates/${update.slug}`}>
          <H3 data-cy="updateTitle" color="#090A0A">
            {update.title}
          </H3>
        </Link>
      );
    } else {
      return (
        <H3 data-cy="updateTitle" color="#090A0A">
          {update.title}
        </H3>
      );
    }
  }

  renderSummary(update) {
    return (
      <React.Fragment>
        <Container my={1} fontsize="14px" color="#4B4E52" dangerouslySetInnerHTML={{ __html: update.summary }} />
        {this.renderUpdateMeta(update)}
      </React.Fragment>
    );
  }

  renderFullContent() {
    const { update, collective, intl, LoggedInUser } = this.props;
    const canEditUpdate = LoggedInUser && LoggedInUser.canEditUpdate(update);
    const canPublishUpdate = LoggedInUser && LoggedInUser.canEditCollective(collective) && !update.publishedAt;
    const editable = !this.props.compact && this.props.editable && canEditUpdate;

    return (
      <React.Fragment>
        {this.renderUpdateMeta(update, editable)}
        <Container>
          {update.html && <div dangerouslySetInnerHTML={{ __html: update.html }} />}
          {!update.html && <UpdateTextWithData id={update.id} />}
          {!update.userCanSeeUpdate && (
            <MessageBox type="info">
              <FormattedMessage
                id="update.private.cannot_view_message"
                defaultMessage="Become a backer of {collective} to see this update"
                values={{ collective: collective.name }}
              />
            </MessageBox>
          )}
          {update.publishedAt && (
            <Link route={`/${collective.slug}/updates`} className="viewLatestUpdates">
              {intl.formatMessage(this.messages['viewLatestUpdates'])}
            </Link>
          )}
          {canPublishUpdate && <PublishUpdateBtnWithData id={update.id} />}
        </Container>
      </React.Fragment>
    );
  }

  renderEditUpdateForm() {
    const { collective, update } = this.props;
    return (
      <Container display="flex" flexDirection="column">
        {this.renderUpdateMeta(update, true)}
        <EditUpdateForm collective={collective} update={update} onSubmit={this.save} />
      </Container>
    );
  }

  render() {
    const { update } = this.props;
    const { mode } = this.state;

    return (
      <UpdateWrapper>
        <AvatarContainer>
          <a href={`/${update.fromCollective.slug}`} title={update.fromCollective.name}>
            <Avatar
              src={update.fromCollective.image}
              type={update.fromCollective.type}
              name={update.fromCollective.name}
              key={update.fromCollective.id}
              radius={40}
            />
          </a>
        </AvatarContainer>
        {mode !== 'edit' && (
          <Container display="flex" flexDirection="column">
            <Box mb={1}>{this.renderUpdateTitle()}</Box>
            {mode === 'summary' && this.renderSummary(update)}
            {mode === 'details' && this.renderFullContent()}
          </Container>
        )}

        {mode === 'edit' && this.renderEditUpdateForm()}
      </UpdateWrapper>
    );
  }
}

const editUpdateQuery = gql`
  mutation editUpdate($update: UpdateAttributesInputType!) {
    editUpdate(update: $update) {
      id
      updatedAt
      title
      markdown
      html
      isPrivate
    }
  }
`;

const deleteUpdateQuery = gql`
  mutation deleteUpdate($id: Int!) {
    deleteUpdate(id: $id) {
      id
    }
  }
`;

const editUpdateMutation = graphql(editUpdateQuery, {
  props: ({ mutate }) => ({
    editUpdate: async update => {
      return await mutate({ variables: { update } });
    },
  }),
});

const deleteUpdateMutation = graphql(deleteUpdateQuery, {
  props: ({ mutate }) => ({
    deleteUpdate: async updateID => {
      return await mutate({ variables: { id: updateID } });
    },
  }),
});

const addUpdateMutations = compose(
  editUpdateMutation,
  deleteUpdateMutation,
);

export default withIntl(addUpdateMutations(StyledUpdate));
