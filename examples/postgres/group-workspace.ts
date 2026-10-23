import {
  PortalConflict, portalEmail, portalId, validateStudyGroup, validateStudyGroupList,
  validateStudySession, validateStudySessionList, validateGroupPostBody, validateGroupPostList,
  validateGroupInvitation, validateGroupInvitationList, validateGroupMemberList,
  validateTeacherRequestInput, validateTeacherRequestList,
  type GroupInvitation, type GroupWorkspace,
} from '../../packages/portal/src/index.ts';
export interface GroupRpcClient {rpc(name:string,parameters?:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>;}

export type GroupDelivery = Readonly<{inviteLearner(groupId:string,email:string):Promise<GroupInvitation>}>;
export function rpcGroupWorkspace(client:GroupRpcClient,delivery?:GroupDelivery):GroupWorkspace {
  async function rpc(name:string,parameters?:Record<string,unknown>) {
    const result=await client.rpc(name,parameters);
    if(result.error){
      const code=typeof result.error==='object'&&result.error!==null&&'code'in result.error?result.error.code:undefined;
      if(code==='40001'||code==='23505')throw new PortalConflict();
      throw new Error('The group service could not complete this request. Check your connection and permissions.');
    }
    return result.data;
  }
  const group=(groupId:string)=>({p_group_id:portalId(groupId)});
  return {
    async listGroups(){return validateStudyGroupList(await rpc('portal_groups'));},
    async saveGroup(value,expectedRevision){return validateStudyGroup(await rpc('portal_save_group',{
      p_group:validateStudyGroup(value),p_expected_revision:expectedRevision===null?null:portalId(expectedRevision)}));},
    async listSessions(groupId){return validateStudySessionList(await rpc('portal_group_sessions',group(groupId)));},
    async saveSession(value,expectedRevision){return validateStudySession(await rpc('portal_save_group_session',{
      p_session:validateStudySession(value),p_expected_revision:expectedRevision===null?null:portalId(expectedRevision)}));},
    async listPosts(groupId){return validateGroupPostList(await rpc('portal_group_posts',group(groupId)));},
    async addPost(groupId,body){await rpc('portal_add_group_post',{...group(groupId),p_body:validateGroupPostBody(body)});},
    async removePost(groupId,id){await rpc('portal_remove_group_post',{...group(groupId),p_id:portalId(id)});},
    async listInvitations(groupId){return validateGroupInvitationList(await rpc('portal_group_invitations',group(groupId)));},
    async inviteLearner(groupId,email){
      const id=portalId(groupId);const address=portalEmail(email);
      if(!delivery)throw new Error('Email invitation delivery is not configured. Contact the library operator.');
      return validateGroupInvitation(await delivery.inviteLearner(id,address));
    },
    async revokeInvitation(groupId,id){await rpc('portal_revoke_group_invitation',{...group(groupId),p_id:portalId(id)});},
    async acceptInvitation(token){
      if(typeof token!=='string'||!/^[0-9a-f]{64}$/u.test(token))throw new Error('Invitation unavailable. Open the link from your invitation email.');
      return validateStudyGroup(await rpc('portal_accept_group_invitation',{p_token:token}));
    },
    async listMembers(groupId){return validateGroupMemberList(await rpc('portal_group_members',group(groupId)));},
    async removeMember(groupId,userId){await rpc('portal_remove_group_member',{...group(groupId),p_user_id:portalId(userId)});},
    async listTeacherRequests(){return validateTeacherRequestList(await rpc('portal_teacher_requests'));},
    async requestTeacher(request){await rpc('portal_request_teacher',{p_request:validateTeacherRequestInput(request)});},
    async createPrivateRoom(requestId,title,description){
      const checked=validateStudyGroup({id:requestId,revision:requestId,title,description,kind:'private',facilitatorId:requestId});
      return validateStudyGroup(await rpc('portal_create_private_room',{p_request_id:portalId(requestId),p_title:checked.title,p_description:checked.description}));
    },
  };
}
