/*
 * Every user-facing string of Bots. No literal UI text lives anywhere else.
 *
 * `companion` and the small blocks after it come from Boite's catalogue
 * (packages/ui/src/lib/strings.en.ts at c4a8b0f7), where the companion was
 * born; `bots` is what the standalone app adds. Add a key here first: the
 * French catalogue is typed from this one and fails `svelte-check` without it.
 */
export const strings = {
  /** The standalone app: its wait for Boite, its tray and its own windows. */
  bots: {
    name: 'B.O.T.S',
    waiting: 'Start Boite to wake the bots',
    waitingHint: 'B.O.T.S looks for Boite on this computer every few seconds.',
    connecting: 'Reaching Boite',
    revealFailed: 'Boite could not show it: {reason}',
    revealUnsupported: 'This version of Boite cannot show it. Update Boite, then try again.',
    /** A thread of another machine of the group: Boite's window here cannot be pointed at it yet. */
    revealElsewhere: 'This thread runs on {machine}: open it in Boite, under that machine.',
    /** A call for a thread whose machine is not connected now. */
    machineAway: '{machine} is out of reach right now.',
    settingsTitle: 'B.O.T.S settings',
    tray: { tooltip: 'B.O.T.S', settings: 'Settings', quit: 'Quit' },
    demo: 'Demo mode: a fake Boite, nothing is sent.',
    /** What the demo asks the lead robot first, for a chat exchange to show. */
    demoQuestion: 'What are my agents working on?'
  },

  /** The island hanging from the top of the screen (`components/island/`). */
  island: {
    label: 'B.O.T.S',
    tabs: { home: 'Home', chat: 'Chat', drop: 'Drop' },
    settings: 'Settings',
    mute: 'Mute the sounds',
    unmute: 'Turn the sounds on',
    pin: 'Keep the island open',
    unpin: 'Let the island close',
    quiet: 'All quiet',
    busyOne: '{count} agent at work',
    busyMany: '{count} agents at work',
    waitingOne: 'An agent needs you',
    waitingMany: '{count} requests wait for you',
    finished: 'Done',
    /** A thread that just ended, told in the pill: "Port the scheduler · done · 3 files". */
    finish: {
      done: 'done',
      failed: 'failed',
      filesOne: '1 file',
      filesMany: '{count} files',
      manyDone: '{count} threads done',
      manyFailed: '{count} threads failed',
      someFailed: '{count} failed'
    },
    /** A permission answered from the pill, without opening the island. */
    ask: 'Permission request',
    /** "Always allow": the rules Bots keeps and answers with (`island/allow.svelte.ts`). */
    allow: {
      always: 'Always…',
      alwaysTitle: 'Allow from now on: {rule}',
      cannot: 'This request is too long to make a rule of',
      thread: 'This thread',
      project: 'This project',
      threadLong: 'For this thread',
      projectLong: 'For this project',
      back: 'Back',
      hint: 'Bots answers for you while it runs',
      traced: 'Allowed by a rule · {rule}',
      title: 'Always allowed',
      lead: 'What you allowed for good from the island. Bots answers these requests itself, only while it runs.',
      empty: 'No rule yet. Use “Always…” on a request.',
      scopeThread: 'Thread: {name}',
      scopeProject: 'Project: {name}',
      remove: 'Remove this rule',
      forgetAll: 'Forget all'
    },
    /** A pull request's CI, followed once a thread opens it (`island/pr-watch.svelte.ts`). */
    pr: {
      number: 'PR #{number}',
      pending: 'CI running',
      green: 'CI green',
      red: 'CI failed',
      open: 'Open the pull request'
    },
    talking: '{name} is answering…',
    robot: '{name}. Click to poke it, drag it out to set it loose on the desktop.',
    home: {
      busy: 'At work',
      none: 'No agent at work right now.',
      reminders: 'Reminders and news',
      focus: 'Focus'
    },
    chat: {
      empty: 'Ask your bots anything: they answer here.',
      to: 'Talk to',
      history: 'Earlier answers',
      hideHistory: 'Hide earlier answers'
    },
    drop: {
      title: 'Drop files here',
      hint: 'They go with your next question, along with a capture if you take one.',
      capture: 'Capture the screen',
      zone: 'Capture a zone',
      captured: 'Screen captured',
      removeShot: 'Remove the capture',
      ask: 'Ask about them'
    },
    attention: { title: 'Your agents need you' },
    dock: 'Back to the island',
    /** The Chat tab's assistant, its quotas pill and the Home's Today card (`components/island/assistant/`). */
    assistant: {
      empty: 'Say hello to {name}. The conversation is the one Boite’s Agents page shows.',
      noAgent: 'No agent to talk to yet. Make one in Settings, or in Boite’s Agents page.',
      makeAgent: 'Open Settings',
      agents: 'Talk to',
      choose: 'Talk to {name}. Choose another agent.',
      openAgent: 'Show {name} in Boite',
      placeholder: 'Message {name}',
      send: 'Send',
      stop: 'Stop',
      working: '{name} is working',
      older: 'Earlier messages',
      removeFile: 'Remove {name}',
      copy: 'Copy the code',
      copied: 'Copied',
      failed: 'The answer stopped: {reason}',
      unreadable: 'The conversation could not be read: {reason}',
      notSent: 'The message did not go: {reason}',
      notKept: 'The files could not be passed on outside the app.',
      notStopped: 'The answer could not be stopped: {reason}',
      notChanged: 'The model could not be changed: {reason}',
      picker: 'Model and effort',
      model: 'Model',
      effort: 'Effort',
      efforts: { low: 'Low', medium: 'Medium', high: 'High' },
      defaultModel: 'Default model',
      defaultEffort: 'Default effort',
      everywhere: 'This applies to {name} everywhere, in Boite too.',
      noModels: 'The agent lists no models yet.',
      quotas: {
        label: 'Quotas: {percent}% left on {name}, {window}. Show every account.',
        title: 'Quotas',
        left: '{percent}% left',
        resets: 'resets in {time}',
        units: { min: '{value} min', h: '{value} h', d: '{value} d' },
        tokens: '{count} tokens used by your threads',
        proxy: 'Subscription proxy'
      },
      recap: {
        title: 'Today',
        finishedOne: '1 thread finished',
        finishedMany: '{count} threads finished',
        filesOne: '1 file changed',
        filesMany: '{count} files changed',
        hours: '{hours} h {minutes}',
        minutes: '{minutes} min',
        instant: 'under a minute',
        none: 'Nothing finished yet today.',
        open: 'Show “{title}” in Boite'
      }
    },
    /** Home's live sessions, the request card and the tab bar's count (`lib/island/sessions.ts`). */
    sessions: {
      title: 'Sessions',
      none: 'Nothing running',
      noneHint: 'Your agents rest. A thread that starts shows here.',
      /** How long a session has been at it (`lib/island/session-time.ts`): seconds under a minute only. */
      duration: { seconds: '{n}s', minutes: '{n} min', hours: '{h}h {m}m', hoursOnly: '{h}h' },
      states: { working: 'Working', waiting: 'Waiting for you', done: 'Done a moment ago', failed: 'Failed' },
      tools: { command: 'Command', edit: 'Edit', write: 'Write', read: 'Read', search: 'Search', fetch: 'Fetch', web: 'Web', agent: 'Agent', other: 'Tool', done: 'Done' },
      /** A row's sub-agents: counted on its second line, listed when it unfolds (`lib/island/sub-agents.ts`). */
      agents: {
        one: '1 sub-agent',
        many: '{count} sub-agents',
        show: 'Show the sub-agents',
        hide: 'Hide the sub-agents',
        progress: '{done} of {total} finished',
        more: '+{count} more',
        open: 'Open “{title}” in Boite',
        untitled: 'Sub-agent',
        states: { working: 'Working', waiting: 'Waiting for you', done: 'Done', failed: 'Failed', stopped: 'Stopped', unknown: 'State unknown' }
      },
      reveal: 'Open in Boite',
      follow: 'Follow in the pill',
      unfollow: 'Stop following in the pill',
      followed: 'Followed in the pill',
      /** A followed thread's state in the pill once it ended, and at rest in Home (`followed.ts`). */
      followState: { done: 'Done', failed: 'Failed', resting: 'At rest' },
      folded: '{count} unchanged lines',
      lead: '{title}: {step}',
      waitingCount: '{count} requests wait for you',
      card: {
        of: '{index} of {count}',
        previous: 'Previous request',
        next: 'Next request',
        deny: 'Deny',
        allowOnce: 'Allow once',
        send: 'Send',
        skip: 'Skip',
        answer: 'Your answer…',
        keyEnter: 'Enter',
        keyEscape: 'Esc'
      }
    },
    /** A finished thread's actions, on its card and its session row (`sessions/NoticeActions.svelte`). */
    notice: {
      relaunch: 'Run again',
      relaunching: 'Starting…',
      retryTitle: 'Ask the agent to try again',
      continueTitle: 'Ask the agent to carry on',
      archive: 'Archive',
      archiving: 'Archiving…',
      archiveTitle: 'Archive the thread while it rests',
      /** The line standing in an archived row's place for a few seconds (`archive-undo.ts`). */
      archived: 'Archived',
      undo: 'Undo',
      undoing: 'Undoing…',
      undoTitle: 'Bring {title} back from the archive',
      offline: 'Boite cannot be reached',
      changes: 'Show the changes',
      hideChanges: 'Hide the changes',
      noChanges: 'No change in its folder.',
      binary: 'A binary file: nothing to show.',
      more: '{count} more files',
      failed: 'That did not work: {reason}',
      retryPrompt: 'Try again.',
      continuePrompt: 'Continue.'
    },
    /** The warning before Boite's memory guard stops an agent (`views/MemoryCard.svelte`). */
    memory: {
      title: { thread: '“{title}” is near its memory cap', budget: 'Your agents are near their memory budget', machine: 'Your PC is running low on memory' },
      used: { thread: '{used} of {limit}', budget: '{used} of {limit} for all agents', machine: '{used} free, Boite keeps {limit} in reserve' },
      culprit: '“{title}” uses the most: {size}',
      next: 'If it keeps growing, Boite stops its largest process.',
      stop: 'Stop the agent',
      stopping: 'Stopping…',
      stopTitle: 'Stop this thread’s processes, as Boite’s task manager does',
      ignore: 'Ignore',
      failed: 'The agent could not be stopped: {reason}',
      stopped: 'Boite stopped {program} in “{title}” to free {size}',
      stoppedAlone: 'Boite stopped {program} to free {size}',
      process: 'a process',
      agent: 'An agent',
      close: 'Close',
      mb: '{value} MB',
      gb: '{value} GB',
      point: '.'
    },
    /** A newer Boite on its track (`views/UpdateCard.svelte`). */
    update: {
      title: { nightly: 'New nightly available', stable: 'New Boite version available' },
      version: 'Version {version}',
      open: 'Install',
      openTitle: 'Opens Boite on its app updates, where it installs',
      manual: 'Install it from Boite: Settings › Machines and updates › App updates.',
      later: 'Later'
    },
    /** What happened while nobody was at the keyboard (`views/AwayCard.svelte`, `away.ts`). */
    away: {
      title: 'While you were away',
      gone: 'Away {span}',
      ok: 'OK',
      okTitle: 'Dismiss the recap',
      lines: 'What happened',
      waiting: {
        permission: '“{title}” has been waiting for your go-ahead for {time}',
        question: '“{title}” has had a question for you for {time}',
        answer: '“{title}” answered {time} ago, unread',
        failed: '“{title}” failed {time} ago, unread'
      },
      othersWaiting: '{count} more threads are waiting for you',
      finishedOne: '“{title}” finished',
      failedOne: '“{title}” failed',
      finishedMany: '{count} threads finished: {titles}',
      failedMark: '{title} (failed)',
      more: '+{count}',
      alarm: 'Reminder: {text}',
      quotaLow: '{name}: {left}% left',
      quotaOut: '{name}: quota used up',
      memoryWarned: 'Memory guard: “{title}” came near its cap',
      memoryMachine: 'Memory guard: your PC ran low on memory',
      memoryStopped: 'Memory guard: Boite stopped {program} in “{title}”',
      open: 'Open',
      span: { minutes: '{m} min', hours: '{h} h', hoursMinutes: '{h} h {m} min' }
    }
  },

  companion: {
    heading: 'B.O.T.S',
    moods: { idle: 'Resting', working: 'At work', calling: 'Needs you', happy: 'Done', worried: 'Boite is not answering' },
    open: 'Open B.O.T.S',
    close: 'Close B.O.T.S',
    ask: 'Ask me something…',
    askLabel: 'Ask B.O.T.S',
    askTo: 'Ask {name} something…',
    askToLabel: 'Ask {name}',
    talkTo: 'Talk to {name}',
    send: 'Send',
    stop: 'Stop',
    thinking: 'Thinking…',
    hideReply: 'Hide the reply',
    openThread: 'Open the conversation in Agents',
    openSettings: 'B.O.T.S settings',
    noBrain: 'No agent can answer. Sign in to one, or pick one in B.O.T.S settings.',
    brainOff: 'The agent picked for B.O.T.S is off or signed out. Pick another in B.O.T.S settings.',
    noAgent: 'No agent stands as B.O.T.S. Add one in B.O.T.S settings.',
    cannotShow: 'The screen and files go with a request in the B.O.T.S app only.',
    failed: 'That did not work: {reason}',
    unreachable: 'Boite is out of reach. B.O.T.S keeps trying.',
    finished: 'Done: {title}',
    requestsOne: '1 request',
    requestsMany: '{count} requests',
    threadsOne: '1 thread at work',
    threadsMany: '{count} threads at work',
    nothingWaiting: 'No agent is waiting for you.',
    noRush: 'No rush',
    threads: 'Threads',
    status: { queued: 'Queued', running: 'At work', waiting: 'Waiting for you', done: 'Done' },
    asyncHint: 'The agent carries on while it waits for your answer.',
    answer: 'Your answer…',
    answerLabel: 'Your answer',
    confirm: 'Confirm',
    skip: 'Skip',
    allow: 'Allow',
    deny: 'Deny',
    archivedThread: 'Archived thread',
    untitled: 'Untitled thread',
    verbs: {
      run: 'Wants to run',
      edit: 'Wants to edit',
      write: 'Wants to write',
      read: 'Wants to read',
      open: 'Wants to open',
      search: 'Wants to search',
      use: 'Wants to use {tool}'
    },
    media: {
      label: 'Music',
      previous: 'Previous track',
      next: 'Next track',
      play: 'Play',
      pause: 'Pause',
      openSpotify: 'Open Spotify',
      now: '{title} by {artist}',
      show: 'Show {app}',
      position: '{position} of {duration}',
      seek: 'Track position',
      lyrics: 'Lyrics',
      lyricsShow: 'Show synced lyrics: the title and the artist are sent to LRCLIB (lrclib.net)',
      lyricsHide: 'Hide the lyrics (the title and the artist are sent to LRCLIB)',
      lyricsNone: 'No synced lyrics'
    },
    hud: {
      label: 'Threads at work and quotas',
      openThread: 'Open {title} in Boite',
      since: 'For {time}',
      quotas: 'Quotas',
      quotaUnknown: 'unknown',
      quotaLow: 'running low',
      quotaOut: 'nearly out',
      helper: '1 sub-agent at work',
      helpers: '{count} sub-agents at work'
    },
    pomodoro: {
      start: 'Pomodoro',
      startTitle: 'Start a pomodoro: {work} min of work, then a {rest} min break',
      stop: {
        pomodoro: 'Stop the pomodoro',
        countdown: 'Stop the timer',
        stopwatch: 'Stop the stopwatch'
      },
      pause: 'Pause',
      resume: 'Resume',
      skip: 'Skip',
      work: 'Work',
      rest: 'Break',
      countdown: 'Timer',
      stopwatch: 'Stopwatch',
      left: '{phase}, {time} left',
      elapsed: '{phase}, {time} so far',
      paused: '{phase}, paused at {time}',
      done: 'Timer done',
      doneFor: 'Timer done: {label}',
      breakTitle: 'Break, {minutes} min',
      breakHint: 'Stand up, stretch, drink something. I am taking it with you.',
      skipBreak: 'Skip the break'
    },
    focus: {
      label: 'Focus',
      turnOn: 'Focus: finished threads wait and sounds stay off, except agents that need you and reminders',
      turnOff: 'End the focus',
      recapOne: 'During the focus: 1 thread finished',
      recapMany: 'During the focus: {count} threads finished'
    },
    history: {
      label: 'History',
      title: 'Earlier exchanges',
      loading: 'Reading the conversation…',
      empty: 'Nothing said yet.',
      noReply: 'No reply',
      pick: 'Show this reply in the bubble'
    },
    drop: {
      label: 'Files for your next question',
      hint: 'Drop to attach to your next question',
      remove: 'Remove {name}',
      reading: 'Reading the files…'
    },
    task: {
      label: 'Threads launched for you',
      confirmTitle: 'Launch a thread in {project}?',
      launch: 'Launch',
      cancel: 'Cancel',
      launched: 'Thread launched in {project}',
      openHint: 'Open it in Boite',
      unknown: 'I do not know a project called "{name}".',
      near: 'Did you mean {names}?',
      known: 'Your projects: {names}.',
      noProject: 'Boite has no project to launch a thread in yet.',
      noAgent: 'No agent can take the thread. Sign in to one in Boite.',
      failed: 'The thread could not be launched: {reason}'
    },
    mission: {
      confirmTitle: 'Schedule a mission in {project}?',
      schedule: 'Schedule',
      cancel: 'Cancel',
      scheduled: 'Mission scheduled in {project}: {when}.',
      launched: 'Mission launched in {project}',
      late: 'Late mission launched in {project}',
      missed: 'A mission was skipped while B.O.T.S was off: {prompt}',
      gone: 'A mission did not run, its project {project} is gone: {prompt}',
      past: 'That time has already passed: no mission was scheduled.',
      noSuch: 'There is no mission {index}.',
      failed: 'The mission could not be scheduled: {reason}',
      once: 'Once, {when}',
      daily: 'Every day at {time}',
      weekdays: 'Weekdays at {time}',
      weekly: 'Every {day} at {time}'
    },
    todo: {
      title: 'To do',
      count: '{done}/{total}',
      countLabel: '{done} of {total} done',
      placeholder: 'Add an item, or ask B.O.T.S',
      add: 'Add',
      check: 'Mark done: {text}',
      uncheck: 'Mark not done: {text}',
      remove: 'Remove {text}',
      clearDone: 'Clear done'
    },
    reply: {
      action: 'Reply from here',
      label: 'Your reply to {title}',
      placeholder: 'Your reply… Enter sends, Shift+Enter adds a line',
      send: 'Send'
    },
    radar: {
      one: 'A thread is waiting for you',
      many: '{count} threads are waiting for you',
      openFirst: 'Open the first',
      openHint: 'Open it in Boite',
      later: 'Later',
      laterHint: 'Hide for 30 minutes, unless another thread starts waiting',
      more: 'And {count} more',
      kinds: {
        permission: 'Permission requested',
        question: 'Question asked',
        answer: 'Answer to read',
        failed: 'Stopped on an error'
      }
    },
    find: {
      searching: 'Looking for "{query}"…',
      found: 'Threads about "{query}"',
      closest: 'Closest to "{query}"',
      none: 'No thread about "{query}"',
      archived: 'Archived',
      openHint: 'Open it in Boite'
    },
    openMissing: 'I cannot find that thread in Boite.',
    seeScreen: 'Show my screen with this request',
    seeingScreen: 'Your screen goes with this request. Click to leave it out.',
    screenFailed: 'The screen could not be captured. Click the eye to send without it.',
    screenScope: 'What B.O.T.S sees',
    screenAll: 'All screens',
    screenHere: 'This screen',
    screenZone: 'A part',
    screenZoneTitle: 'You pick what to show when you send',
    zoneLabel: 'Pick what to show',
    zoneHint: 'Drag over what to show, or click to show the whole screen. Esc cancels.',
    zoneOtherScreen: 'Move the pointer to another screen to pick there.',
    failedThread: 'Stopped on an error: {title}',
    openNotice: 'Open in Boite',
    dismiss: 'Dismiss',
    reminder: 'Reminder',
    reminderDone: 'OK',
    snooze: 'In 10 min',
    snoozeLabel: 'Remind me again in 10 minutes',
    settings: {
      intro: 'B.O.T.S puts your agents on your screen: one robot per agent. Click one to ask it something or to answer your agents, drag it to move it. Each robot talks in its own conversation, which you also find in Boite’s Agents page.',
      desktopOnly: 'The robots run in the B.O.T.S app: these settings take effect there.',
      place: 'Place',
      screen: 'Screen',
      screenHint: 'The screen B.O.T.S sits on. A screen that is unplugged sends it back to the main one.',
      primary: 'Main screen',
      screenSize: '{width} × {height}',
      position: 'Position',
      positionHint: 'Along the top of the screen, or where you dropped it: drag B.O.T.S anywhere to move it.',
      anchors: { left: 'Top left', center: 'Top center', right: 'Top right', free: 'Where you left it' },
      brain: 'New agents',
      brainHint: 'What an agent made here for B.O.T.S runs on. An agent made already keeps its own model and permissions: change them in Agents.',
      model: 'Model',
      modelHint: 'The agent and model a new B.O.T.S agent runs on. Automatic takes the first agent signed in, on its small model.',
      automatic: 'Automatic',
      automaticHint: 'First agent signed in, small model',
      account: 'Account',
      effort: 'Effort',
      effortDefault: 'Model default',
      control: 'Computer control',
      controlHint: 'What a new B.O.T.S agent may do on this computer when you ask it: open apps and pages, play music, launch a game.',
      controls: { ask: 'Ask before acting', auto: 'Act without asking' },
      controlsHint: {
        ask: 'Every command waits for Allow or Deny in B.O.T.S.',
        auto: 'Commands run as soon as B.O.T.S decides to. It can then do anything your account can on this computer.'
      },
      music: 'React to music',
      musicHint: 'Headphones and a little dance when something plays, and the player controls under B.O.T.S.',
      lyrics: 'Synced lyrics',
      lyricsHint: 'The words of the song in the player, line by line. They come from LRCLIB (lrclib.net), a free lyrics library: B.O.T.S sends it the title and the artist of each track you play, nothing else.',
      quotas: 'Show quotas',
      quotasHint: 'A small gauge per subscription of the proxy (Douane) beside B.O.T.S, with its provider’s logo, red when one nearly runs out. Turn off the ones you do not want to see in the list below.',
      quotasShown: 'Quotas shown beside B.O.T.S',
      pomodoro: 'Pomodoro',
      pomodoroHint: 'A work timer beside B.O.T.S, started from its panel or by asking it. A break follows the work, and B.O.T.S takes it with you. Ask it for a timer or a stopwatch and it shows there too.',
      workMinutes: 'Work',
      breakMinutes: 'Break',
      minutes: '{count} min',
      focusOnWork: 'Focus during work',
      focusOnWorkHint: 'While the pomodoro runs its work phase, finished threads wait for the end and the sounds stay off, except agents that need you and reminders.',
      closeOutside: 'Close when clicking elsewhere',
      closeOutsideHint: 'A click anywhere but on B.O.T.S closes its panel, as a menu would. Escape closes it too.',
      hideFullscreen: 'Hide during full-screen apps',
      hideFullscreenHint: 'B.O.T.S steps aside while a game or a video fills its screen, and comes back after. The shortcut still calls it.',
      sounds: 'Sounds',
      soundsHint: 'Short chimes when an answer comes, an agent needs you or a reminder rings.',
      awayRecap: 'Recap when you come back',
      awayRecapHint: 'Back after 15 minutes or more away, the island tells what finished, what waits for you and what rang meanwhile.',
      radar: 'Waiting threads',
      radarHint: 'When threads have waited for you this long (a permission, a question, an answer you have not read), B.O.T.S says so and opens the first on a click.',
      radarOff: 'Off',
      hotkey: 'Shortcut',
      hotkeyHint: 'Calls B.O.T.S from any app, ready to type.',
      hotkeyOff: 'None',
      hotkeyTaken: 'Another app already uses {hotkey}. Pick another shortcut.',
      robots: 'Robots',
      robotsHint: 'In the island at the top of the screen, or loose on the desktop. You can also drag a robot out of the island, and back to the top edge to return it.',
      robotsChoice: { island: 'In the island', desktop: 'On the desktop' },
      openOnHover: 'Open on hover',
      openOnHoverHint: 'Resting the pointer on the island a moment opens it. Off, only a click does.',
      pillRest: 'Pill at rest',
      pillRestHint: 'What the closed island shows when nothing else needs it. Requests and finished threads still show over it.',
      pillRests: { live: 'Live line', quota: 'Quota', music: 'Music', timer: 'Timer', robot: 'Robot only' },
      pillRestHints: { live: 'The thread at work and what it does', quota: 'The quota with the least left', music: 'Title and artist of what plays, else the live line', timer: 'The running timer or pomodoro, else the live line', robot: 'A short pill, no text' },
      mascot: 'Mascot',
      mascotHint: 'The island’s robot, and the first agent’s on the desktop. Pick a style, then make it yours.',
      mascotReset: 'Use the first agent’s own look',
      look: 'Look',
      crew: {
        title: 'Agents',
        hint: 'The agents standing on your screen side by side, {count} at most. Click one to talk to it alone: each keeps its own conversation and memory, in Agents. The first one also shows what goes on in Boite.',
        loading: 'Reading the agents…',
        empty: 'No agent stands as B.O.T.S. Make one, or add one of your agents.',
        leader: 'Shows what goes on in Boite',
        restyle: 'New look',
        restyleLabel: 'Give {name} a new look',
        open: 'Open {name} in Agents',
        remove: 'Take {name} off the screen',
        lastOne: 'B.O.T.S keeps one agent at least.',
        namePlaceholder: 'Name a new agent…',
        nameLabel: 'Name of a new B.O.T.S agent',
        create: 'Make',
        addExisting: 'Add an agent',
        full: '{count} agents stand already. Take one off to add another.'
      },
      reminders: 'Reminders',
      remindersEmpty: 'No reminder set. Ask B.O.T.S, for example: remind me at 6 pm to call Paul.',
      removeReminder: 'Cancel this reminder',
      missions: 'Scheduled missions',
      missionsHint: 'Threads B.O.T.S launches by itself at a set time, in the project named. Ask it, for example: every day at 9 am, sum up the night’s pull requests in boite.',
      missionsEmpty: 'No mission scheduled.',
      missionNext: 'Next: {when}',
      missionPaused: 'Paused',
      missionGone: 'Project gone: this mission will not run',
      pauseMission: 'Pause this mission',
      resumeMission: 'Resume this mission',
      removeMission: 'Delete this mission',
      warmOff: 'Each answer starts the agent again, which takes a few seconds. To keep it loaded between answers, set Warm process minutes in Boite’s Settings, Advanced.',
      warmOn: 'Agents stay loaded {minutes} min after an answer, so the next one comes sooner.'
    }
  },

  agents: {
    robot: {
      family: 'Style', shape: 'Shape', color: 'Color', eyes: 'Eyes', top: 'Accessory', shuffle: 'Shuffle', customize: 'Customize', done: 'Done',
      option: '{part} {n}', families: { jelly: 'Jelly', bubble: 'Bubble', capsule: 'Capsule', retro: 'Retro', box: 'Box' },
      box: { shape: 'Lid', color: 'Body', eyes: 'Eyes', top: 'Accessory' },
    }
  },

  chat: {
    progress: { starting: 'Starting agent', thinking: 'Thinking', compacting: 'Compacting context', retrying: 'Retrying request', tool: 'Running tool', working: 'Receiving activity', waiting: 'Waiting for provider' }
  },

  composer: {
    attachReadError: '{name} could not be read.',
    attachUnnamed: 'the attachment',
    attachTooLarge: '{name} is too big: a file may weigh {max} at most.',
    attachTooMany: 'A turn carries at most {max} files, so {name} was left out.',
    attachTotalTooLarge: 'The files of one turn weigh {max} at most together, so {name} was left out.'
  },

  quotas: {
    remaining: '{percent}% left'
  }
} as const;

export type Strings = typeof strings;

/** `fill('Open {title} in Boite', { title: 'Notes' })`. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
