/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  List,
  PasswordInput,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useListState } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { X509Certificate } from "@peculiar/x509"
import { produce } from "immer";
import { nanoid } from "nanoid";
import PocketBase, { ClientResponseError, LocalAuthStore } from "pocketbase";
import LegacyPocketBase, {
  ClientResponseError as LegacyClientResponseError,
  LocalAuthStore as LegacyLocalAuthStore,
} from "pocketbase-legacy";
import { z } from "zod";

const clearAuthStorage = () => {
  localStorage.removeItem("certimate-ma-auth-1");
  localStorage.removeItem("certimate-ma-auth-2");
};
window.addEventListener("load", clearAuthStorage);
window.addEventListener("beforeunload", clearAuthStorage);

const Migration = () => {
  const [pb1, setPb1] = useState<LegacyPocketBase>();
  const [pb2, setPb2] = useState<PocketBase>();

  const [step, setStep] = useState(1);

  const [list, listHandlers] = useListState<string>([]);

  const handleStep1Connect = (pb: LegacyPocketBase) => {
    setPb1(pb);
    setStep(2);
    setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 1);
  };

  const handleStep2Connect = async (pb: PocketBase) => {
    setPb2(pb);
    setStep(3);
    setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 1);
  };

  const handleStep3Transfer = async (options: {
    randomTriggerCron: boolean;
  }) => {
    if (pb1 == null || pb2 == null) {
      throw new Error("Please connect to Certimate services first.");
    }

    listHandlers.setState([]);

    const settings = await pb1.collection("settings").getFullList({ perPage: 65535 });
    const acmeaccts = await pb1.collection("acme_accounts").getFullList({ perPage: 65535 });
    const accesses = await pb1.collection("access").getFullList({ perPage: 65535, filter: "deleted=null" });
    const domains = await pb1.collection("domains").getFullList({ perPage: 65535 });

    // migrate settings
    for (const setting of settings) {
      let record: typeof setting | undefined = undefined;

      if (setting.name === "ssl-provider") {
        record = produce(setting, (draft) => {
          draft.name = "sslProvider";
          draft.content ??= {};

          if (typeof draft.content === "string") {
            draft.content = JSON.parse(draft.content || "{}");
          }

          switch (draft.content.provider) {
            case "gts":
              {
                draft.content.provider = "googletrustservices";
                draft.content.config ??= {};
                draft.content.config.googletrustservices = draft.content.config.gts;
                delete draft.content.config.gts;
              }
              break;
          }
        });
      } else if (setting.name === "emails") {
        record = produce(setting, () => { });
      }

      if (!record) {
        continue;
      }
      console.log("[certimate] transfer settings: ", record);

      const collection = pb2.collection("settings");
      const existing = (await collection.getList(1, 1, { filter: `name='${record.name}'` })).items[0];
      if (existing) {
        record = produce(record, (draft) => {
          draft.id = existing.id;
        });
        await collection.update(record.id, record);
      } else {
        await collection.create(record);
      }

      listHandlers.append(`Transfered settings record: #${record.id} ${record.name}`);
      setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 1);
    }

    // migrate acme accounts
    for (const acmeacct of acmeaccts) {
      let record = produce(acmeacct, (draft) => {
        draft.privateKey = draft.key;
        delete draft.key;

        if (typeof draft.resource === "string") {
          draft.resource = JSON.parse(draft.resource || "{}");
        }

        draft.acmeAccount = draft.resource.body;
        draft.acmeAcctUrl = draft.resource.uri;
        delete draft.resource;

        switch (draft.ca) {
          case "gts":
            {
              draft.ca = "googletrustservices";
              draft.acmeDirUrl = "https://dv.acme-v02.api.pki.goog/directory";
            }
            break;
          case "letsencrypt":
            {
              draft.acmeDirUrl = "https://acme-v02.api.letsencrypt.org/directory";
            }
            break;
          case "zerossl":
            {
              draft.acmeDirUrl = "https://acme.zerossl.com/v2/DV90";
            }
            break;
        }

        return draft;
      });
      console.log("[certimate] transfer acmeacct: ", record);

      const collection = pb2.collection("acme_accounts");
      const existing =
        (await collection.getList(1, 1, { filter: `acmeAcctUrl='${record.acmeAcctUrl}'` })).items[0] ||
        (await collection.getList(1, 1, { filter: `id='${record.id}'` })).items[0];
      if (existing) {
        record = produce(record, (draft) => {
          draft.id = existing.id;
        });
        await collection.update(record.id, record);
      } else {
        await collection.create(record);
      }

      listHandlers.append(`Transfered acme account record: #${record.id} ${record.email}`);
      setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 1);
    }

    // migrate accesses
    for (const access of accesses) {
      const record = produce(access, (draft) => {
        draft.provider = draft.configType;
        delete draft.configType;
        delete draft.group;
        delete draft.usage;

        switch (draft.provider) {
          case "httpreq":
            {
              draft.provider = "acmehttpreq";
            }
            break;
          case "pdns":
            {
              draft.provider = "powerdns";
              draft.config ??= {};
              draft.config.serverUrl = draft.config.apiUrl;
              delete draft.config.apiUrl;
            }
            break;
          case "ssh":
            {
              draft.config ??= {};
              draft.config.authMethod = draft.config.key ? "key" : draft.config.password ? "password" : "none";
            }
            break;
          case "tencent":
            {
              draft.provider = "tencentcloud";
            }
            break;
          case "webhook":
            {
              draft.config ??= {};
              draft.config.method = "POST";
              draft.config.headers = "Content-Type: application/json";
              draft.config.data = JSON.stringify({
                // eslint-disable-next-line no-template-curly-in-string
                ["Domain"]: "${CERTIMATE_DEPLOYER_COMMONNAME}",
                // eslint-disable-next-line no-template-curly-in-string
                ["Certificate"]: "${CERTIMATE_DEPLOYER_CERTIFICATE}",
                // eslint-disable-next-line no-template-curly-in-string
                ["PrivateKey"]: "${CERTIMATE_DEPLOYER_PRIVATEKEY}",
              });
            }
            break;
        }
      });
      console.log("[certimate] transfer access: ", record);

      const collection = pb2.collection("access");
      const existing = (await collection.getList(1, 1, { filter: `id='${record.id}'` })).items[0];
      if (existing) {
        await collection.update(record.id, record);
      } else {
        await collection.create(record);
      }

      listHandlers.append(`Transfered access record: #${record.id} ${record.name}`);
      setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 1);
    }

    // migrate domains -> workflow
    // keep domain.id as workflow.id
    const workflowApplyNodeMap = new Map<string, string>();
    for (const domain of domains) {
      const record: { id: string; } & Record<string, unknown> = {
        id: domain.id,
        name: `${domain.domain}`,
        description: `Transfered from obsolete database`,
        trigger: "scheduled",
        triggerCron: domain.crontab,
        enabled: domain.enabled,
      };

      if (options.randomTriggerCron) {
        const minute = Math.floor(Math.random() * 60);
        const hour = Math.floor(Math.random() * 24);
        record.triggerCron = `${minute} ${hour} * * *`;
      }

      const normalizeNodeId = (nodeId: string) => nodeId.replace(/^[-_]+/, "").replace(/[-_]+$/, "");
      const nodes: Record<string, unknown>[] = [
        {
          id: `m${normalizeNodeId(nanoid(16))}`,
          type: "start",
          data: {
            name: "开始",
            config: {
              trigger: record.trigger,
              triggerCron: record.triggerCron,
            },
          },
        },
      ];
      if (domain.applyConfig != null) {
        const access = accesses.find((e) => e.id === domain.applyConfig.access);
        if (!access) {
          continue;
        }

        let providerType = access.configType;
        switch (providerType) {
          case "aliyun":
            providerType = "aliyun-dns";
            break;
          case "aws":
            providerType = "aws-route53";
            break;
          case "httpreq":
            providerType = "acmehttpreq";
            break;
          case "huaweicloud":
            providerType = "huaweicloud-dns";
            break;
          case "pdns":
            providerType = "powerdns";
            break;
          case "tencent":
            providerType = "tencentcloud-dns";
            break;
          case "volcengine":
            providerType = "volcengine-dns";
            break;
        }

        nodes.push({
          id: `m${normalizeNodeId(domain.id)}`,
          type: "bizApply",
          data: {
            name: "申请",
            config: {
              challengeType: "dns-01",
              contactEmail: domain.email,
              provider: providerType,
              providerAccessId: access.id,
              domains: domain.domain,
              keySource: "auto",
              keyAlgorithm: domain.applyConfig.keyAlgorithm || "RSA2048",
              nameservers: domain.applyConfig.nameservers,
              dnsPropagationTimeout: domain.applyConfig.timeout,
              disableFollowCNAME: domain.applyConfig.disableFollowCNAME,
              skipBeforeExpiryDays: 30,
            },
          },
        });

        workflowApplyNodeMap.set(record.id, nodes.at(-1)!.id as string);
      }
      if (domain.deployConfig != null) {
        (Array.isArray(domain.deployConfig) ? domain.deployConfig : [domain.deployConfig]).forEach((deployConfig) => {
          const node = {
            id: `m${normalizeNodeId(deployConfig.id)}`,
            type: "bizDeploy",
            data: {
              name: "部署",
              config: {
                certificateOutputNodeId: workflowApplyNodeMap.get(record.id),
                provider: deployConfig.type,
                providerAccessId: deployConfig.access,
                providerConfig: deployConfig.config,
                skipOnLastSucceeded: true,
              },
            },
          };

          switch (node.data.config.provider) {
            case "aliyun-cdn":
              {
                node.data.config.providerConfig.region = "cn-hangzhou";
              }
              break;
            case "aliyun-oss":
              {
                const endpoint = node.data.config.providerConfig.endpoint as string;
                node.data.config.providerConfig.region = endpoint === "" || endpoint === "oss.aliyuncs.com"
                  ? "cn-hangzhou"
                  : endpoint.split(".").at(0)!.split("//").at(-1);
                delete node.data.config.providerConfig.endpoint;
              }
              break;
            case "k8s-secret":
              {
                node.data.config.providerConfig.secretType = "kubernetes.io/tls";
              }
              break;
            case "local":
              {
                node.data.config.providerConfig.format = String(node.data.config.providerConfig.format).toUpperCase();
                node.data.config.providerConfig.postCommand = node.data.config.providerConfig.command;
                delete node.data.config.providerConfig.command;
              }
              break;
            case "ssh":
              {
                node.data.config.providerConfig.format = String(node.data.config.providerConfig.format).toUpperCase();
                node.data.config.providerConfig.postCommand = node.data.config.providerConfig.command;
                delete node.data.config.providerConfig.command;
              }
              break;
            case "tencent-cdn":
              {
                node.data.config.provider = "tencentcloud-cdn";
              }
              break;
            case "tencent-clb":
              {
                node.data.config.provider = "tencentcloud-clb";
              }
              break;
            case "tencent-cos":
              {
                node.data.config.provider = "tencentcloud-cos";
              }
              break;
            case "tencent-ecdn":
              {
                node.data.config.provider = "tencentcloud-ecdn";
              }
              break;
            case "tencent-teo":
              {
                node.data.config.provider = "tencentcloud-eo";
                node.data.config.providerConfig.domain = node.data.config.providerConfig.domain.split("\n").at(0)!.trim();
              }
              break;
          }

          nodes.push(node);
        })
      }
      record.graphDraft = { nodes };
      record.graphContent = { nodes };
      record.hasContent = true;
      console.log("[certimate] transfer workflow: ", record);

      const collection = pb2.collection("workflow");
      const existing = (await collection.getList(1, 1, { filter: `id='${record.id}'` })).items[0];
      if (existing) {
        await collection.update(record.id, record);
      } else {
        await collection.create(record);
      }

      listHandlers.append(`Transfered workflow record: #${record.id} ${record.name}`);
      setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 1);
    }

    // migrate domains -> workflowRun
    for (const domain of domains) {
      if (!domain.certificate) {
        continue;
      }
      if (!domain.lastDeployment) {
        continue;
      }

      const workflow = await pb2.collection("workflow").getOne(domain.id);

      const record: { id: string; } & Record<string, unknown> = {
        id: domain.lastDeployment,
        trigger: "scheduled",
        status: "succeeded",
        workflowRef: workflow.id,
        startedAt: domain.lastDeployedAt,
        endedAt: domain.lastDeployedAt,
        graph: workflow.graphContent,
      };
      console.log("[certimate] transfer workrun: ", record);

      const collection = pb2.collection("workflow_run");
      const existing = (await collection.getList(1, 1, { filter: `id='${record.id}'` })).items[0];
      if (existing) {
        await collection.update(record.id, record);
      } else {
        await collection.create(record);
      }

      listHandlers.append(`Transfered workrun record: #${record.id}`);
      setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 1);
    }

    // migrate domains -> workflowOutput
    for (const domain of domains) {
      if (!domain.certificate) {
        continue;
      }
      if (!domain.lastDeployment) {
        continue;
      }

      const workflow = await pb2.collection("workflow").getOne(domain.id);
      const workflowRun = await pb2.collection("workflow_run").getOne(domain.lastDeployment);

      const record: { id: string; } & Record<string, unknown> = {
        id: domain.lastDeployment,
        nodeId: workflowApplyNodeMap.get(workflow.id),
        nodeConfig: workflow.graphContent.nodes.find((n: any) => n.id === workflowApplyNodeMap.get(workflow.id)).data.config,
        workflowRef: workflow.id,
        runRef: workflowRun.id,
        outputs: [{ type: "ref", name: "certificate", value: `certificate#${domain.id}`, valueType: "string" }],
        succeeded: true,
      };
      console.log("[certimate] transfer workoutput: ", record);

      const collection = pb2.collection("workflow_output");
      const existing = (await collection.getList(1, 1, { filter: `id='${record.id}'` })).items[0];
      if (existing) {
        await collection.update(record.id, record);
      } else {
        await collection.create(record);
      }

      listHandlers.append(`Transfered workoutput record: #${record.id}`);
      setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 1);
    }

    // migrate domains -> certificate
    for (const domain of domains) {
      if (!domain.certificate) {
        continue;
      }
      if (!domain.lastDeployment) {
        continue;
      }

      const workflow = await pb2.collection("workflow").getOne(domain.id);
      const workflowRun = await pb2.collection("workflow_run").getOne(domain.lastDeployment);
      const workflowOutput = await pb2.collection("workflow_output").getOne(domain.lastDeployment);

      const x509 = new X509Certificate(domain.certificate);

      const record: { id: string; } & Record<string, unknown> = {
        id: domain.lastDeployment,
        acmeCertStableUrl: domain.certStableUrl,
        acmeCertUrl: domain.certUrl,
        subjectAltNames: (x509.getExtension("2.5.29.17") as any)?.names?.items?.map((e: any) => e.value)?.join(";"),
        certificate: domain.certificate,
        issuerCertificate: domain.issuerCertificate,
        privateKey: domain.privateKey,
        validityNotBefore: x509.notBefore,
        validityNotAfter: x509.notAfter,
        validityInterval: (x509.notAfter.getTime() - x509.notBefore.getTime()) / 1000,
        serialNumber: x509.serialNumber,
        issuerOrg: x509.issuer.split("O=").at(1)?.split(",")?.at(0),
        keyAlgorithm: x509.publicKey.algorithm.name.startsWith("RSA")
          ? `RSA${(x509.publicKey.algorithm as any).modulusLength}`
          : x509.publicKey.algorithm.name.startsWith("ECDSA")
            ? `EC${(x509.publicKey.algorithm as any).namedCurve.split("-")[1]}`
            : "",
        source: "request",
        workflowRef: workflow.id,
        workflowRunRef: workflowRun.id,
        workflowNodeId: workflowOutput.nodeId,
      };
      console.log("[certimate] transfer certificate: ", record);

      const collection = pb2.collection("certificate");
      const existing = (await collection.getList(1, 1, { filter: `id='${record.id}' && deleted=null` })).items[0];
      if (existing) {
        await collection.update(record.id, record);
      } else {
        await collection.create(record);
      }

      listHandlers.append(`Transfered certificate record: #${record.id}`);
      setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 1);
    }

    setStep(4);
  };

  return (
    <div className="flex flex-col gap-4">
      <Alert color="blue" title="How to use Certimate Migration Assistant?">
        Please follow the guidelines:&nbsp;
        <a href="https://github.com/certimate-go/migration-assistant" target="_blank">
          https://github.com/certimate-go/migration-assistant
        </a>
      </Alert>

      {step >= 1 && <Step1Card onConnect={handleStep1Connect} />}
      {step >= 2 && <Step2Card onConnect={handleStep2Connect} />}
      {step >= 3 && (
        <Step3Card onTransfer={handleStep3Transfer}>
          <List className="list-decimal" mt="md" size="sm" spacing="xs" withPadding>
            {list.map((item, index) => (
              <List.Item className="font-mono list-item text-gray-800" key={index}>
                {item}
              </List.Item>
            ))}
          </List>
        </Step3Card>
      )}
      {step >= 4 && (
        <Card padding="md" radius="md" shadow="sm" withBorder>
          <Text className="text-center font-medium text-xl" c="orange">🎉 Congratulations! Migration completed.</Text>
        </Card>
      )}
    </div>
  );
};

const usePbForm = () => {
  const schema = z.object({
    serverUrl: z.url().nonempty(),
    username: z.email().nonempty(),
    password: z.string().nonempty().min(6)
  })
  const form = useForm({
    mode: "controlled",
    initialValues: {
      serverUrl: "",
      username: "",
      password: "",
    },
    validate: {
      serverUrl: (value) => {
        const result = schema.shape.serverUrl.safeParse(value);
        if (!result.success) {
          const err = z.treeifyError(result.error);
          return err.errors[0];
        }
      },
      username: (value) => {
        const result = schema.shape.username.safeParse(value);
        if (!result.success) {
          const err = z.treeifyError(result.error);
          return err.errors[0];
        }
      },
      password: (value) => {
        const result = schema.shape.password.safeParse(value);
        if (!result.success) {
          const err = z.treeifyError(result.error);
          return err.errors[0];
        }
      }
    }
  })

  return { schema, form };
};

const Step1Card = ({
  className,
  style,
  onConnect,
}: {
  className?: string;
  style?: React.CSSProperties;
  onConnect?: (client: LegacyPocketBase) => void;
}) => {
  const { form } = usePbForm();

  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  const handleConnect = async () => {
    const validation = form.validate();
    if (validation.hasErrors) {
      return;
    }

    setConnecting(true);
    setConnected(false);

    try {
      const { serverUrl, username, password } = form.values;

      const pb = new LegacyPocketBase(
        serverUrl,
        new LegacyLocalAuthStore("certimate-ma-auth-1")
      );
      await pb.admins.authWithPassword(username, password);

      await onConnect?.(pb);

      setConnected(true);
    } catch (err) {
      console.error(err);

      let errmsg = "Failed to connect to Certimate.";
      if (err instanceof LegacyClientResponseError) {
        errmsg = err.message;
      } else if (err instanceof Error) {
        errmsg = err.message;
      } else if (err) {
        errmsg = String(err);
      }

      notifications.show({
        color: "red",
        title: "Connect Failed",
        message: errmsg,
        position: "top-right",
      });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Card
      className={className}
      style={style}
      padding="md"
      radius="md"
      shadow="sm"
      withBorder
    >
      <Text size="lg">
        Step 1: Connect to old Certimate service (v0.2.x)
      </Text>

      <form className="mt-4">
        <TextInput
          label="Server URL"
          placeholder="https://127.0.0.1:8090/"
          disabled={connected}
          readOnly={connecting}
          key={form.key("serverUrl")}
          {...form.getInputProps("serverUrl")}
        />
        <Group gap="sm" align="start">
          <TextInput
            className="flex-1"
            autoComplete="new-password"
            label="Username"
            placeholder="Please enter username"
            disabled={connected}
            readOnly={connecting}
            key={form.key("username")}
            {...form.getInputProps("username")}
          />
          <PasswordInput
            className="flex-1"
            autoComplete="new-password"
            label="Password"
            placeholder="Please enter password"
            disabled={connected}
            readOnly={connecting}
            key={form.key("password")}
            {...form.getInputProps("password")}
          />
        </Group>
      </form>

      {connected ? (
        <Button fullWidth color="green" mt="md" radius="md">
          Connected
        </Button>
      ) : (
        <Button
          fullWidth
          mt="md"
          radius="md"
          loading={connecting}
          onClick={handleConnect}
        >
          Connect
        </Button>
      )}
    </Card>
  );
};

const Step2Card = ({
  className,
  style,
  onConnect,
}: {
  className?: string;
  style?: React.CSSProperties;
  onConnect?: (client: PocketBase) => void;
}) => {
  const { form } = usePbForm();

  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);

  const handleConnect = async () => {
    const validation = form.validate();
    if (validation.hasErrors) {
      return;
    }

    setConnecting(true);
    setConnected(false);

    try {
      const { serverUrl, username, password } = form.values;

      const pb = new PocketBase(
        serverUrl,
        new LocalAuthStore("certimate-ma-auth-2")
      );
      await pb.collection("_superusers").authWithPassword(username, password);

      await onConnect?.(pb);

      setConnected(true);
    } catch (err) {
      console.error(err);

      let errmsg = "Failed to connect to Certimate.";
      if (err instanceof LegacyClientResponseError) {
        errmsg = err.message;
      } else if (err instanceof Error) {
        errmsg = err.message;
      } else if (err) {
        errmsg = String(err);
      }

      notifications.show({
        color: "red",
        title: "Connect Failed",
        message: errmsg,
        position: "top-right",
      });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Card
      className={className}
      style={style}
      padding="md"
      radius="md"
      shadow="sm"
      withBorder
    >
      <Text size="lg">Step 2: Connect to new Certimate service (v0.4.x)</Text>

      <form className="mt-4">
        <TextInput
          label="Server URL"
          placeholder="https://127.0.0.1:8090/"
          disabled={connected}
          readOnly={connecting}
          key={form.key("serverUrl")}
          {...form.getInputProps("serverUrl")}
        />
        <Group gap="sm" align="start">
          <TextInput
            className="flex-1"
            autoComplete="new-password"
            label="Username"
            placeholder="Please enter username"
            disabled={connected}
            readOnly={connecting}
            key={form.key("username")}
            {...form.getInputProps("username")}
          />
          <PasswordInput
            className="flex-1"
            autoComplete="new-password"
            label="Password"
            placeholder="Please enter password"
            disabled={connected}
            readOnly={connecting}
            key={form.key("password")}
            {...form.getInputProps("password")}
          />
        </Group>
      </form>

      {connected ? (
        <Button fullWidth mt="md" radius="md" color="green">
          Connected
        </Button>
      ) : (
        <Button
          fullWidth
          mt="md"
          radius="md"
          loading={connecting}
          onClick={handleConnect}
        >
          Connect
        </Button>
      )}
    </Card>
  );
};

const Step3Card = ({
  className,
  style,
  children,
  onTransfer,
}: {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  onTransfer?: (options: { randomTriggerCron: boolean }) => void;
}) => {
  const form = useForm({
    mode: "controlled",
    initialValues: {
      randomTriggerCron: true,
    },
  });

  const [transferring, setTransferring] = useState(false);
  const [transferred, setTransferred] = useState(false);

  const handleTransfer = async () => {
    setTransferring(true);
    setTransferred(false);

    try {
      await onTransfer?.(form.getValues());

      setTransferred(true);
    } catch (err) {
      console.error(err);

      let errmsg = "Failed to transfer data.";
      if (err instanceof ClientResponseError) {
        errmsg = err.message;
      } else if (err instanceof Error) {
        errmsg = err.message;
      } else if (err) {
        errmsg = String(err);
      }

      notifications.show({
        color: "red",
        title: "Transfer Failed",
        message: errmsg,
        position: "top-right",
      });
    } finally {
      setTransferring(false);
    }
  };

  return (
    <Card
      className={className}
      style={style}
      padding="md"
      radius="md"
      shadow="sm"
      withBorder
    >
      <Text size="lg">Step 3: Transfer data</Text>

      <form className="mt-4">
        <Checkbox
          label="Random trigger cron (recommended)"
          disabled={transferred}
          readOnly={transferring}
          key={form.key("randomTriggerCron")}
          {...form.getInputProps("randomTriggerCron", { type: "checkbox" })}
        />
      </form>

      {children}

      {transferred ? (
        <Button fullWidth color="green" mt="md" radius="md">
          Transfered
        </Button>
      ) : (
        <Button
          fullWidth
          mt="md"
          radius="md"
          loading={transferring}
          onClick={handleTransfer}
        >
          Transfer
        </Button>
      )}
    </Card>
  );
};

export default Migration;
