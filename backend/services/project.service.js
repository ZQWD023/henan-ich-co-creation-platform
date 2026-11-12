// services/project.service.js —— 共创协作业务核心（本平台的差异化模块）
//
// 生命周期状态机（这是答辩时要讲清楚的第一张图）：
//
//   draft ──发布招募──> recruiting ──开始协作──> in_progress ──提交结项──> reviewing ──结项公示──> closed
//     │                    │                        │                        │
//     └────────────────────┴────────────────────────┴────取消────> cancelled  └──退回重做──> in_progress
//
// 成员：pending ──通过──> approved ──(主动退出/被移除)──> quit / removed
// 任务：todo ──> doing ──> review ──> done
const { AppError } = require('../utils/response');
const { genId } = require('../utils/id');
const { db } = require('../db/database');
const { projectRepo, memberRepo, taskRepo, versionRepo, discussionRepo } = require('../repositories/project.repo');
const { notificationService } = require('./notification.service');

const PROJECT_STATUS = {
  DRAFT: 'draft',
  RECRUITING: 'recruiting',
  IN_PROGRESS: 'in_progress',
  REVIEWING: 'reviewing',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
};

const STATUS_TEXT = {
  draft: '草稿',
  recruiting: '招募中',
  in_progress: '协作中',
  reviewing: '结项评审中',
  closed: '已结项',
  cancelled: '已取消',
};

/** 允许的状态迁移表 */
const TRANSITIONS = {
  draft: ['recruiting', 'cancelled'],
  recruiting: ['in_progress', 'cancelled'],
  in_progress: ['reviewing', 'cancelled'],
  reviewing: ['closed', 'in_progress'],
  closed: [],
  cancelled: [],
};

const MEMBER_STATUS_TEXT = {
  pending: '待审核',
  approved: '已加入',
  rejected: '已驳回',
  quit: '已退出',
  removed: '已移除',
};

const TASK_STATUS_TEXT = { todo: '待开始', doing: '进行中', review: '待验收', done: '已完成' };

/* ---------------- 工具 ---------------- */
function canManage(project, user) {
  return Boolean(user) && (project.owner_id === user.id || user.role === 'admin');
}

function assertManage(project, user) {
  if (!canManage(project, user)) throw AppError.forbidden('只有项目发起人或管理员可以操作');
}

/** 项目内成员判定（发起人视为当然成员） */
function isProjectMember(project, user) {
  if (!user) return false;
  if (project.owner_id === user.id) return true;
  const m = memberRepo.find(project.id, user.id);
  return Boolean(m && m.status === 'approved');
}

function assertMember(project, user) {
  if (!isProjectMember(project, user)) throw AppError.forbidden('只有项目成员可以操作');
}

function mapProject(row, extra = {}) {
  const taskTotal = row.task_total ?? 0;
  const taskDone = row.task_done ?? 0;
  return {
    id: row.id,
    title: row.title,
    coverUrl: row.cover_url,
    description: row.description,
    recruitNeed: row.recruit_need,
    memberLimit: row.member_limit,
    membersCount: row.members_count,
    deadline: row.deadline,
    status: row.status,
    statusText: STATUS_TEXT[row.status] || row.status,
    nextStatuses: (TRANSITIONS[row.status] || []).map((s) => ({ status: s, text: STATUS_TEXT[s] })),
    viewsCount: row.views_count,
    isFeatured: Boolean(row.is_featured),
    heritageId: row.heritage_id,
    heritageName: row.heritage_name || null,
    owner: {
      id: row.owner_id,
      username: row.owner_name,
      displayName: row.owner_display || row.owner_name,
      avatar: row.owner_avatar,
    },
    progress: taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0,
    taskStats: { total: taskTotal, done: taskDone },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
    ...extra,
  };
}

const projectService = {
  PROJECT_STATUS,
  STATUS_TEXT,
  MEMBER_STATUS_TEXT,
  TASK_STATUS_TEXT,
  TRANSITIONS,

  /* ==================== 项目 CRUD ==================== */
  list(query) {
    const sortMap = {
      newest: 'p.created_at DESC',
      hot: 'p.views_count DESC, p.members_count DESC',
      deadline: 'p.deadline IS NULL, p.deadline ASC',
    };
    const { list, total } = projectRepo.search({
      status: query.status,
      heritageId: query.heritageId,
      ownerId: query.ownerId,
      memberOf: query.memberOf,
      keyword: query.keyword,
      sortBy: sortMap[query.sort] || sortMap.newest,
      limit: query.limit,
      offset: query.offset,
    });
    return { list: list.map((r) => mapProject(r)), total };
  },

  /** 项目详情：一次返回发起人、成员、任务、版本、讨论、我的身份 */
  detail(id, user) {
    const row = projectRepo.findById(id);
    if (!row) throw AppError.notFound('共创项目不存在');

    // 非公开状态只有成员/管理员能看
    if (['draft', 'cancelled'].includes(row.status) && !canManage(row, user) && !isProjectMember(row, user)) {
      throw AppError.notFound('共创项目不存在');
    }
    projectRepo.incViews(id);

    const members = memberRepo.list(id).map((m) => ({
      memberId: m.id,
      userId: m.user_id,
      username: m.username,
      displayName: m.display_name || m.username,
      avatar: m.avatar,
      role: m.role,
      status: m.status,
      statusText: MEMBER_STATUS_TEXT[m.status],
      applyReason: m.apply_reason,
      joinedAt: m.joined_at,
    }));

    const tasks = taskRepo.list(id).map((t) => this._mapTask(t));
    const versions = versionRepo.list(id).map((v) => ({
      id: v.id,
      versionNo: v.version_no,
      title: v.title,
      content: v.content,
      fileUrl: v.file_url,
      coverUrl: v.cover_url,
      submitterName: v.submitter_name,
      isFinal: Boolean(v.is_final),
      createdAt: v.created_at,
    }));

    const stats = taskRepo.stats(id);
    const myMember = user ? memberRepo.find(id, user.id) : null;

    return mapProject(
      {
        ...row,
        task_total: stats.total || 0,
        task_done: stats.done || 0,
      },
      {
        members,
        tasks,
        versions,
        discussionCount: discussionRepo.count(id),
        myRole: row.owner_id === (user && user.id) ? 'owner' : myMember ? myMember.role : null,
        myMemberStatus: row.owner_id === (user && user.id) ? 'approved' : myMember ? myMember.status : null,
        canManage: canManage(row, user),
        canApply:
          Boolean(user) &&
          row.status === 'recruiting' &&
          row.owner_id !== user.id &&
          !myMember &&
          row.members_count < row.member_limit,
        progressDetail: {
          total: stats.total || 0,
          done: stats.done || 0,
          review: stats.review || 0,
          avgProgress: Math.round(stats.avg_progress || 0),
        },
      }
    );
  },

  create(user, body) {
    // 发起项目门槛：已认证传承人或管理员（普通用户可申请加入）
    if (user.role === 'user' && user.cert_status !== 'approved') {
      throw AppError.forbidden('发起共创项目需要先完成传承人认证');
    }
    const row = {
      id: genId('proj'),
      owner_id: user.id,
      heritage_id: body.heritageId || null,
      title: body.title,
      cover_url: body.coverUrl || null,
      description: body.description || null,
      recruit_need: body.recruitNeed || null,
      member_limit: body.memberLimit || 10,
      deadline: body.deadline || null,
      status: body.publish ? 'recruiting' : 'draft',
    };
    const p = projectRepo.create(row);
    // 发起人自动计入成员
    memberRepo.create({
      id: genId('mem'),
      project_id: p.id,
      user_id: user.id,
      role: '统筹',
      apply_reason: '项目发起人',
      status: 'approved',
      reviewed_by: user.id,
    });
    projectRepo.refreshMemberCount(p.id);
    return this.detail(p.id, user);
  },

  update(id, user, body) {
    const project = projectRepo.findById(id);
    if (!project) throw AppError.notFound('共创项目不存在');
    assertManage(project, user);

    if (['closed', 'cancelled'].includes(project.status)) {
      throw AppError.conflict('已结束的项目不能再编辑');
    }

    const patch = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.recruitNeed !== undefined) patch.recruit_need = body.recruitNeed;
    if (body.coverUrl !== undefined) patch.cover_url = body.coverUrl;
    if (body.heritageId !== undefined) patch.heritage_id = body.heritageId;
    if (body.memberLimit !== undefined) patch.member_limit = body.memberLimit;
    if (body.deadline !== undefined) patch.deadline = body.deadline;

    projectRepo.update(id, patch);
    return this.detail(id, user);
  },

  /* ==================== 状态机 ==================== */
  changeStatus(id, user, target, note) {
    const project = projectRepo.findById(id);
    if (!project) throw AppError.notFound('共创项目不存在');
    assertManage(project, user);

    const allowed = TRANSITIONS[project.status] || [];
    if (!allowed.includes(target)) {
      throw AppError.conflict(
        `当前状态「${STATUS_TEXT[project.status]}」不能直接转为「${STATUS_TEXT[target] || target}」。` +
          `可选：${allowed.map((s) => STATUS_TEXT[s]).join('、') || '无（已是终态）'}`
      );
    }

    // 各步的前置条件（这些校验正是"闭环"和"假闭环"的区别）
    if (target === 'recruiting') {
      if (!project.description || project.description.length < 10) {
        throw AppError.param('发布招募前请完善项目描述（至少 10 字）');
      }
    }
    if (target === 'in_progress') {
      const approved = memberRepo.countApproved(id);
      if (approved < 2) throw AppError.conflict('至少需要 2 名成员（含发起人）才能进入协作阶段');
    }
    if (target === 'reviewing') {
      if (versionRepo.list(id).length === 0) throw AppError.conflict('请先提交至少一个成果版本再申请结项');
    }
    if (target === 'closed') {
      const versions = versionRepo.list(id);
      if (versions.length === 0) throw AppError.conflict('没有可公示的成果');
      let final = versionRepo.findFinal(id);
      if (!final) {
        // 未显式指定最终版本时，默认取最新一版
        versionRepo.setFinal(id, versions[0].id);
        final = versionRepo.findById(versions[0].id);
      }
      projectRepo.setStatus(id, 'closed');
      this._publishFinalAsWork(project, final);
    } else {
      projectRepo.setStatus(id, target);
    }

    // 通知所有成员
    const members = memberRepo.list(id, { status: 'approved' });
    members
      .filter((m) => m.user_id !== user.id)
      .forEach((m) =>
        notificationService.push({
          userId: m.user_id,
          actorId: user.id,
          type: notificationService.TYPE.PROJECT,
          title: `项目「${project.title}」状态更新为：${STATUS_TEXT[target]}`,
          content: note || null,
          targetType: 'project',
          targetId: id,
        })
      );

    return this.detail(id, user);
  },

  /** 结项 → 自动把最终成果发布为作品，形成"共创→作品库→社区"的闭环 */
  _publishFinalAsWork(project, version) {
    const exists = db.prepare('SELECT id FROM work WHERE project_id = ? AND title = ?').get(project.id, version.title);
    if (exists) return exists.id;

    const workId = genId('work');
    db.prepare(
      `INSERT INTO work (id, user_id, heritage_id, project_id, title, work_type, summary, content,
        cover_url, file_url, tags, status)
       VALUES (?, ?, ?, ?, ?, '共创成果', ?, ?, ?, ?, ?, 'approved')`
    ).run(
      workId,
      project.owner_id,
      project.heritage_id,
      project.id,
      version.title,
      `来自共创项目「${project.title}」的结项成果`,
      version.content || '',
      version.cover_url || project.cover_url,
      version.file_url,
      JSON.stringify(['共创成果'])
    );
    return workId;
  },

  /* ==================== 成员管理 ==================== */
  apply(id, user, { role, reason }) {
    const project = projectRepo.findById(id);
    if (!project) throw AppError.notFound('共创项目不存在');
    if (project.owner_id === user.id) throw AppError.conflict('你是项目发起人，无需申请');
    if (project.status !== 'recruiting') throw AppError.conflict('该项目当前不在招募阶段');

    const exist = memberRepo.find(id, user.id);
    if (exist) {
      if (exist.status === 'approved') throw AppError.conflict('你已经在该项目中');
      if (exist.status === 'pending') throw AppError.conflict('申请正在审核中，请耐心等待');
      // rejected / quit / removed 允许重新申请：重置为 pending
      db.prepare(
        "UPDATE co_member SET status = 'pending', role = ?, apply_reason = ?, reviewed_at = NULL WHERE id = ?"
      ).run(role || exist.role, reason || null, exist.id);
    } else {
      if (project.members_count >= project.member_limit) throw AppError.conflict('该项目成员已满');
      memberRepo.create({
        id: genId('mem'),
        project_id: id,
        user_id: user.id,
        role: role || '设计',
        apply_reason: reason || null,
        status: 'pending',
        reviewed_by: null,
      });
    }

    notificationService.push({
      userId: project.owner_id,
      actorId: user.id,
      type: notificationService.TYPE.PROJECT,
      title: `${user.display_name || user.username} 申请加入「${project.title}」`,
      content: reason || `申请分工：${role || '设计'}`,
      targetType: 'project',
      targetId: id,
    });

    return this.detail(id, user);
  },

  reviewMember(id, user, memberUserId, decision, note) {
    const project = projectRepo.findById(id);
    if (!project) throw AppError.notFound('共创项目不存在');
    assertManage(project, user);

    const m = memberRepo.find(id, memberUserId);
    if (!m) throw AppError.notFound('成员申请不存在');
    if (m.status !== 'pending') throw AppError.conflict(`该申请当前状态为「${MEMBER_STATUS_TEXT[m.status]}」，不能重复审核`);
    if (!['approved', 'rejected'].includes(decision)) throw AppError.param('decision 只能是 approved 或 rejected');

    if (decision === 'approved' && project.members_count >= project.member_limit) {
      throw AppError.conflict('成员已满，无法通过');
    }

    memberRepo.setStatus(m.id, decision, user.id);
    projectRepo.refreshMemberCount(id);

    notificationService.push({
      userId: memberUserId,
      actorId: user.id,
      type: notificationService.TYPE.PROJECT,
      title:
        decision === 'approved'
          ? `你已加入共创项目「${project.title}」`
          : `你的申请未通过：${project.title}`,
      content: note || (decision === 'approved' ? '现在可以领取任务了' : '可以尝试申请其他项目'),
      targetType: 'project',
      targetId: id,
    });

    return this.detail(id, user);
  },

  changeMemberRole(id, user, memberUserId, role) {
    const project = projectRepo.findById(id);
    if (!project) throw AppError.notFound('共创项目不存在');
    assertManage(project, user);
    const m = memberRepo.find(id, memberUserId);
    if (!m || m.status !== 'approved') throw AppError.notFound('该成员不在项目中');
    memberRepo.setRole(m.id, role);
    return this.detail(id, user);
  },

  /** 退出 / 移除：targetUserId 省略表示自己退出 */
  removeMember(id, user, targetUserId, action = 'removed') {
    const project = projectRepo.findById(id);
    if (!project) throw AppError.notFound('共创项目不存在');

    const isSelf = !targetUserId || targetUserId === user.id;
    const target = isSelf ? user.id : targetUserId;

    if (target === project.owner_id) throw AppError.forbidden('发起人不能退出自己的项目');
    if (!isSelf) assertManage(project, user);

    const m = memberRepo.find(id, target);
    if (!m || m.status !== 'approved') throw AppError.notFound('该成员不在项目中');

    memberRepo.setStatus(m.id, isSelf ? 'quit' : 'removed', user.id);
    projectRepo.refreshMemberCount(id);

    if (!isSelf) {
      notificationService.push({
        userId: target,
        actorId: user.id,
        type: notificationService.TYPE.PROJECT,
        title: `你已被移出项目「${project.title}」`,
        targetType: 'project',
        targetId: id,
      });
    }
    return this.detail(id, user);
  },

  /* ==================== 任务管理 ==================== */
  _mapTask(t) {
    return {
      id: t.id,
      projectId: t.project_id,
      projectTitle: t.project_title,
      title: t.title,
      description: t.description,
      assigneeId: t.assignee_id,
      assigneeName: t.assignee_name || null,
      assigneeAvatar: t.assignee_avatar || null,
      deadline: t.deadline,
      status: t.status,
      statusText: TASK_STATUS_TEXT[t.status] || t.status,
      progress: t.progress,
      submitContent: t.submit_content,
      submitUrl: t.submit_url,
      createdBy: t.created_by,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  },

  listTasks(id, query, user) {
    const project = projectRepo.findById(id);
    if (!project) throw AppError.notFound('共创项目不存在');
    assertMember(project, user);
    return taskRepo.list(id, { status: query.status, assigneeId: query.assigneeId }).map((t) => this._mapTask(t));
  },

  createTask(id, user, body) {
    const project = projectRepo.findById(id);
    if (!project) throw AppError.notFound('共创项目不存在');

    // 发起人 / 管理员 / 项目内"统筹"角色可以派任务
    const m = memberRepo.find(id, user.id);
    const canDispatch = canManage(project, user) || (m && m.status === 'approved' && m.role === '统筹');
    if (!canDispatch) throw AppError.forbidden('只有发起人或统筹角色可以创建任务');

    if (['reviewing', 'closed', 'cancelled'].includes(project.status)) {
      throw AppError.conflict('项目已进入结项流程，不能再新增任务');
    }

    // 指派人必须是项目内已通过成员
    if (body.assigneeId && !isProjectMember(project, { id: body.assigneeId })) {
      const target = memberRepo.find(id, body.assigneeId);
      if (!target || target.status !== 'approved') throw AppError.param('被指派人不是项目成员');
    }

    const row = {
      id: genId('task'),
      project_id: id,
      title: body.title,
      description: body.description || null,
      assignee_id: body.assigneeId || null,
      created_by: user.id,
      deadline: body.deadline || null,
      status: 'todo',
      progress: 0,
    };
    const t = taskRepo.create(row);

    if (body.assigneeId && body.assigneeId !== user.id) {
      notificationService.push({
        userId: body.assigneeId,
        actorId: user.id,
        type: notificationService.TYPE.PROJECT,
        title: `你有新任务：${body.title}`,
        content: `来自项目「${project.title}」`,
        targetType: 'task',
        targetId: t.id,
      });
    }
    return this._mapTask(t);
  },

  updateTask(taskId, user, body) {
    const t = taskRepo.findById(taskId);
    if (!t) throw AppError.notFound('任务不存在');
    const project = projectRepo.findById(t.project_id);
    if (!project) throw AppError.notFound('共创项目不存在');

    const isAssignee = t.assignee_id === user.id;
    const manager = canManage(project, user);
    if (!isAssignee && !manager) throw AppError.forbidden('只有任务负责人或发起人可以更新任务');

    // 只有发起人能改负责人与截止时间
    const patch = {};
    if (body.title !== undefined) {
      if (!manager) throw AppError.forbidden('只有发起人可以修改任务标题');
      patch.title = body.title;
    }
    if (body.description !== undefined) patch.description = body.description;
    if (body.deadline !== undefined) {
      if (!manager) throw AppError.forbidden('只有发起人可以修改截止时间');
      patch.deadline = body.deadline;
    }
    if (body.assigneeId !== undefined) {
      if (!manager) throw AppError.forbidden('只有发起人可以改派任务');
      const target = memberRepo.find(t.project_id, body.assigneeId);
      if (!target || target.status !== 'approved') throw AppError.param('被指派人不是项目成员');
      patch.assignee_id = body.assigneeId;
    }

    if (body.status !== undefined) {
      if (!['todo', 'doing', 'review', 'done'].includes(body.status)) {
        throw AppError.param('任务状态只能是 todo / doing / review / done');
      }
      // 验收（review → done）属于管理动作
      if (body.status === 'done' && !manager) throw AppError.forbidden('任务完成需要发起人验收');
      patch.status = body.status;
      if (body.status === 'done') patch.progress = 100;
      if (body.status === 'doing' && (t.progress || 0) === 0) patch.progress = 10;
    } else if (body.progress !== undefined) {
      patch.progress = Math.max(0, Math.min(100, Number(body.progress)));
      if (patch.progress === 100) patch.status = 'review'; // 提交 100% 自动进入待验收
    }

    if (body.submitContent !== undefined) patch.submit_content = body.submitContent;
    if (body.submitUrl !== undefined) patch.submit_url = body.submitUrl;

    const updated = taskRepo.update(taskId, patch);

    if (patch.status === 'review' && manager === false) {
      notificationService.push({
        userId: project.owner_id,
        actorId: user.id,
        type: notificationService.TYPE.PROJECT,
        title: `任务待验收：${updated.title}`,
        content: `项目「${project.title}」`,
        targetType: 'task',
        targetId: taskId,
      });
    }
    if (patch.status === 'done' && updated.assignee_id) {
      notificationService.push({
        userId: updated.assignee_id,
        actorId: user.id,
        type: notificationService.TYPE.PROJECT,
        title: `任务已验收通过：${updated.title}`,
        targetType: 'task',
        targetId: taskId,
      });
    }
    return this._mapTask(updated);
  },

  deleteTask(taskId, user) {
    const t = taskRepo.findById(taskId);
    if (!t) throw AppError.notFound('任务不存在');
    const project = projectRepo.findById(t.project_id);
    assertManage(project, user);
    taskRepo.remove(taskId);
    return true;
  },

  myTasks(userId, query) {
    return taskRepo.myTasks(userId, query).map((t) => this._mapTask(t));
  },

  /* ==================== 版本与成果 ==================== */
  createVersion(id, user, body) {
    const project = projectRepo.findById(id);
    if (!project) throw AppError.notFound('共创项目不存在');
    assertMember(project, user);

    if (['closed', 'cancelled'].includes(project.status)) {
      throw AppError.conflict('项目已结束，不能再提交版本');
    }

    const row = {
      id: genId('ver'),
      project_id: id,
      version_no: versionRepo.nextVersionNo(id),
      title: body.title,
      content: body.content || null,
      file_url: body.fileUrl || null,
      cover_url: body.coverUrl || null,
      submitter_id: user.id,
      is_final: 0,
    };
    const v = versionRepo.create(row);

    const members = memberRepo.list(id, { status: 'approved' }).filter((m) => m.user_id !== user.id);
    members.forEach((m) =>
      notificationService.push({
        userId: m.user_id,
        actorId: user.id,
        type: notificationService.TYPE.PROJECT,
        title: `「${project.title}」提交了新版本 v${v.version_no}`,
        content: v.title,
        targetType: 'version',
        targetId: v.id,
      })
    );
    return this.detail(id, user).versions[0];
  },

  listVersions(id, user) {
    const project = projectRepo.findById(id);
    if (!project) throw AppError.notFound('共创项目不存在');
    return versionRepo.list(id).map((v) => ({
      id: v.id,
      versionNo: v.version_no,
      title: v.title,
      content: v.content,
      fileUrl: v.file_url,
      coverUrl: v.cover_url,
      submitterName: v.submitter_name,
      isFinal: Boolean(v.is_final),
      createdAt: v.created_at,
    }));
  },

  markFinal(id, versionId, user) {
    const project = projectRepo.findById(id);
    if (!project) throw AppError.notFound('共创项目不存在');
    assertManage(project, user);
    const v = versionRepo.findById(versionId);
    if (!v || v.project_id !== id) throw AppError.notFound('版本不存在');
    versionRepo.setFinal(id, versionId);
    return this.listVersions(id, user);
  },

  /* ==================== 项目内讨论 ==================== */
  listDiscussions(id, query, user) {
    const project = projectRepo.findById(id);
    if (!project) throw AppError.notFound('共创项目不存在');
    const { list, total } = discussionRepo.list(id, query);
    return {
      list: list.map((d) => ({
        id: d.id,
        userId: d.user_id,
        userName: d.user_name,
        userAvatar: d.user_avatar,
        content: d.content,
        replyTo: d.reply_to,
        replyContent: d.reply_content,
        replyUser: d.reply_user,
        mentions: (() => {
          try {
            return JSON.parse(d.mentions || '[]');
          } catch {
            return [];
          }
        })(),
        createdAt: d.created_at,
      })),
      total,
    };
  },

  createDiscussion(id, user, body) {
    const project = projectRepo.findById(id);
    if (!project) throw AppError.notFound('共创项目不存在');
    assertMember(project, user);

    const mentions = Array.isArray(body.mentions) ? body.mentions : [];
    const row = {
      id: genId('disc'),
      project_id: id,
      user_id: user.id,
      content: body.content,
      reply_to: body.replyTo || null,
      mentions: JSON.stringify(mentions),
    };
    const d = discussionRepo.create(row);

    // @ 通知
    mentions.forEach((uid) =>
      notificationService.push({
        userId: uid,
        actorId: user.id,
        type: notificationService.TYPE.PROJECT,
        title: `${user.display_name || user.username} 在「${project.title}」中提到了你`,
        content: body.content.slice(0, 80),
        targetType: 'project',
        targetId: id,
      })
    );

    return {
      id: d.id,
      content: d.content,
      createdAt: d.created_at,
      mentions,
    };
  },

  /* ==================== 我的工作台 ==================== */
  myWorkspace(userId) {
    const owned = projectRepo.search({ ownerId: userId, limit: 100, offset: 0 }).list.map((r) => mapProject(r));
    const joined = memberRepo
      .myProjects(userId, { status: 'approved', limit: 100, offset: 0 })
      .filter((p) => p.owner_id !== userId)
      .map((r) => mapProject(r));
    const pendingApplications = db
      .prepare(
        `SELECT m.id, m.project_id, m.user_id, m.role, m.apply_reason, m.joined_at,
                p.title AS project_title, u.display_name AS applicant, u.avatar AS applicant_avatar
         FROM co_member m JOIN co_project p ON p.id = m.project_id
         JOIN users u ON u.id = m.user_id
         WHERE p.owner_id = ? AND m.status = 'pending' ORDER BY m.joined_at ASC`
      )
      .all(userId);

    const todoTasks = taskRepo
      .myTasks(userId, { limit: 50, offset: 0 })
      .filter((t) => t.status !== 'done')
      .map((t) => this._mapTask(t));

    return {
      owned,
      joined,
      pendingApplications,
      todoTasks,
      summary: {
        ownedCount: owned.length,
        joinedCount: joined.length,
        pendingApplyCount: pendingApplications.length,
        todoTaskCount: todoTasks.length,
      },
    };
  },
};

module.exports = { projectService, PROJECT_STATUS, STATUS_TEXT, TRANSITIONS };
