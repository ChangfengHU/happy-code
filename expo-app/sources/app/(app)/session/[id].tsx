import * as React from 'react';
import { useRoute } from "@react-navigation/native";
import { SessionView } from '@/-session/SessionView';


export default React.memo(() => {
    const route = useRoute();
    const params = (route.params || {}) as { id: string; path?: string };
    const sessionId = params.id;
    const switchPath = typeof params.path === 'string' ? params.path : undefined;
    return (<SessionView id={sessionId} switchPath={switchPath} />);
});
