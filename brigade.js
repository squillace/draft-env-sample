const { events, Job, Group } = require('brigadier')

events.on("push", (brigadeEvent, project) => {
    
    // setup variables
    var gitPayload = JSON.parse(brigadeEvent.payload)
    var brigConfig = new Map()
    brigConfig.set("registryUrl", project.secrets.registryUrl)
    brigConfig.set("registryUsername", project.secrets.registryUsername)
    brigConfig.set("registryPassword", project.secrets.registryPassword)
    brigConfig.set("webImage", "squillace/node-debug")
    brigConfig.set("gitSHA", brigadeEvent.commit.substr(0,7))
    brigConfig.set("eventType", brigadeEvent.type)
    brigConfig.set("branch", getBranch(gitPayload))
    var today = new Date()
    brigConfig.set("buildDate", today.toISOString().substring(0, 10))
    brigConfig.set("imageTag", `${brigConfig.get("branch")}-${brigConfig.get("gitSHA")}`)
    brigConfig.set("containerImage", `${brigConfig.get("registryUrl")}/${brigConfig.get("webImage")}`)
    
    console.log(`==> gitHub webook (${brigConfig.get("branch")}) with commit ID ${brigConfig.get("gitSHA")}`)
    console.log(`==> Date ${brigConfig.get("buildDate")}`)

    // setup brigade jobs properly
    var docker = new Job("job-runner-docker")
    var helm = new Job("job-runner-helm")
    dockerJobRunner(brigConfig, docker)
    helmJobRunner(brigConfig, helm, "prod")
    
    // start pipeline
    console.log(`==> starting pipeline for docker image: ${brigConfig.get("containerImage")}:${brigConfig.get("imageTag")}`)
    var pipeline = new Group()
    pipeline.add(docker)
    pipeline.add(helm)
    if (brigConfig.get("branch") == "master") {
        pipeline.runEach()
    } else {
        console.log(`==> no jobs to run when not master`)
    }  
})

events.on("after", (event, proj) => {
    console.log("brigade pipeline finished successfully")

    var slack = new Job("slack-notify", "technosophos/slack-notify:latest", ["/slack-notify"])
    slack.storage.enabled = false
    slack.env = {
      SLACK_WEBHOOK: proj.secrets.slackWebhook,
      SLACK_USERNAME: "brigade-demo",
      SLACK_MESSAGE: "Brigade pipeline finished successfully",
      SLACK_COLOR: "#00ff00"
    }
	slack.run()
    
})

function dockerJobRunner(config, d) {
    d.storage.enabled = false
    d.image = "chzbrgr71/dockernd:node"
    d.privileged = true
    d.tasks = [
        "dockerd-entrypoint.sh &",
        "echo waiting && sleep 20",
        "cd /src/",
        `docker login ${config.get("registryUrl")} -u ${config.get("registryUsername")} -p ${config.get("registryPassword")}`,
        `docker build --build-arg BUILD_DATE=${config.get("buildDate")} --build-arg IMAGE_TAG_REF=${config.get("imageTag")} --build-arg VCS_REF=${config.get("gitSHA")} -t ${config.get("webImage")} .`,
        `docker tag ${config.get("webImage")} ${config.get("containerImage")}:${config.get("imageTag")}`,
        `docker push ${config.get("containerImage")}:${config.get("imageTag")}`,
        "killall dockerd"
    ]
}

function helmJobRunner (config, h, deployType) {
    h.storage.enabled = false
    h.image = "chzbrgr71/k8s-helm:v2.7.2"
    h.tasks = [
        "cd /src/",
        "git clone https://github.com/squillace/draft-env-sample.git",
        "cd rating-charts",
        `helm upgrade --install node-prod charts/javascript --set web.image=${config.get("containerImage")} --set web.imageTag=${config.get("imageTag")}`
    ]
}

function slackJob (s, webhook, message) {
    s.storage.enabled = false
    s.env = {
      SLACK_WEBHOOK: webhook,
      SLACK_USERNAME: "brigade-demo",
      SLACK_MESSAGE: message,
      SLACK_COLOR: "#0000ff"
    }
}

function getBranch (p) {
    if (p.ref) {
        return p.ref.substring(11)
    } else {
        return "PR"
    }
}