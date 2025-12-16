import { createTheme, MantineProvider, Container } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

import Migration from "@/views/Migration";

const theme = createTheme({
  primaryColor: "orange",
});

const RootApp = () => {
  return (
    <MantineProvider theme={theme}>
      <Notifications />
      <div className="px-4 py-6">
        <Container>
          <Migration />
        </Container>
      </div>
    </MantineProvider>
  );
};

export default RootApp;
